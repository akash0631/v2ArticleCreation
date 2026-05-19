import { useState, useRef, useEffect, useMemo } from 'react';
import {
  App, Card, Button, Form, Select, Radio, Upload, Input, Row, Col,
  Typography, Space, Spin, Alert, Image, Divider, Tag,
  Empty, Progress,
} from 'antd';
import {
  UploadOutlined, ThunderboltOutlined, DownloadOutlined, DeleteOutlined,
  CameraOutlined, InboxOutlined, FolderOpenOutlined, FileZipOutlined,
  ReloadOutlined, EyeOutlined, HistoryOutlined,
} from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
const SERVER_BASE = API_BASE.replace(/\/api$/, '');

// Switch to the background-job pipeline once a request would be too large to
// finish in one HTTP round-trip. Anything below this still uses the original
// synchronous /generate endpoint for snappy UX.
const BULK_THRESHOLD = 5;

// localStorage key holding the most recent bulk jobId so we can resume polling
// after a tab switch / page refresh. Cleared when the job finishes or is dropped.
const ACTIVE_JOB_KEY = 'modelGen_activeJobId';
const RECENT_JOBS_REFRESH_MS = 15000;

interface GeneratedImage {
  file: string;
  view: string;
  url: string;
  source?: string;
}

interface BulkTaskResult {
  fileName: string;
  view: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  url?: string;
  sourceUrl?: string;
  error?: string;
}

// Canonical view order — used to lay out cells left-to-right per garment row.
const VIEW_ORDER = ['front', 'back', 'left_side', 'closeup'] as const;
type ViewName = typeof VIEW_ORDER[number];

interface GarmentRow {
  fileName: string;
  source?: string;
  // Per-view cell. Missing key = not expected for this job.
  cells: Partial<Record<ViewName, { url?: string; status?: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'; error?: string }>>;
}

type JobStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'PARTIAL';

interface JobSummary {
  id: string;
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  pending: number;
  running: number;
  error?: string;
  results: BulkTaskResult[];
}

interface JobListItem {
  id: string;
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

const isActiveStatus = (s: JobStatus) => s === 'QUEUED' || s === 'RUNNING';

const GENDER_OPTIONS = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Kid Boy', value: 'kid boy' },
  { label: 'Kid Girl', value: 'kid girl' },
];

const BODYTYPE_OPTIONS = [
  { label: 'Full Body', value: 'Full-Body' },
  { label: 'Upper Body', value: 'Upper-Body' },
  { label: 'Lower Body', value: 'Lower-Body' },
];

const VIEW_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  left_side: 'Left Side',
  'left side': 'Left Side',
  closeup: 'Closeup',
};

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const isImage = (name: string) => IMAGE_EXTS.some(ext => name.toLowerCase().endsWith(ext));

export default function ModelGenerationPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [designFiles, setDesignFiles] = useState<RcFile[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [patternFile, setPatternFile] = useState<RcFile | null>(null);
  const [broachFile, setBroachFile] = useState<RcFile | null>(null);
  const [colorImageFile, setColorImageFile] = useState<RcFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const loadRecentJobs = async () => {
    const token = localStorage.getItem('authToken');
    try {
      setRecentLoading(true);
      const res = await fetch(`${API_BASE}/model-generation/bulk/jobs/recent?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) setRecentJobs(data.jobs || []);
    } catch {
      // silent — recent list is best-effort
    } finally {
      setRecentLoading(false);
    }
  };

  // On mount: try to resume the most recently active job (saved in localStorage),
  // and load the recent-jobs list. Also set a 15s refresh for the list.
  useEffect(() => {
    const savedJobId = localStorage.getItem(ACTIVE_JOB_KEY);
    if (savedJobId) {
      const token = localStorage.getItem('authToken');
      resumeJob(savedJobId, token);
    }
    loadRecentJobs();
    recentTimerRef.current = setInterval(loadRecentJobs, RECENT_JOBS_REFRESH_MS);
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (recentTimerRef.current) clearInterval(recentTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startFakeProgress = () => {
    setProgress(0);
    let p = 0;
    progressTimerRef.current = setInterval(() => {
      p += Math.random() * 4;
      if (p >= 90) { clearInterval(progressTimerRef.current!); p = 90; }
      setProgress(Math.round(p));
    }, 800);
  };

  const stopFakeProgress = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
  };

  const stopPolling = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  const isBulkMode = !!zipFile || designFiles.length > BULK_THRESHOLD;

  // Blob URLs for source thumbnails in the non-bulk flow. The bulk flow uses
  // server-side URLs (sourceUrl on each task), so we only need blobs for files
  // that are still local. URLs created here are intentionally not revoked —
  // the browser cleans them up on unmount; revoking eagerly causes flicker
  // when designFiles changes shape but the underlying files are the same.
  const designSourceMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of designFiles) {
      try { m[f.name] = URL.createObjectURL(f); } catch { /* ignore */ }
    }
    return m;
  }, [designFiles]);

  // Group the current results into one row per garment, in view-canonical order.
  // For an active bulk job we use job.results (includes PENDING/RUNNING/FAILED so
  // we can render placeholders). For the non-bulk flow we use the flat results array.
  const garmentRows = useMemo<GarmentRow[]>(() => {
    const acc = new Map<string, GarmentRow>();
    const ensure = (fileName: string, source?: string) => {
      let row = acc.get(fileName);
      if (!row) { row = { fileName, source, cells: {} }; acc.set(fileName, row); }
      if (!row.source && source) row.source = source;
      return row;
    };

    if (job) {
      for (const r of job.results) {
        const row = ensure(r.fileName, r.sourceUrl);
        if (VIEW_ORDER.includes(r.view as ViewName)) {
          row.cells[r.view as ViewName] = { url: r.url, status: r.status, error: r.error };
        }
      }
    } else {
      for (const r of results) {
        const row = ensure(r.file, r.source ?? designSourceMap[r.file]);
        if (VIEW_ORDER.includes(r.view as ViewName)) {
          row.cells[r.view as ViewName] = { url: r.url, status: 'DONE' };
        }
      }
    }

    return Array.from(acc.values());
  }, [job, results, designSourceMap]);

  // Which view columns to render. For an active job we trust the task list; otherwise
  // derive from the form so single-view mode renders as 2 cells (source + front).
  const visibleViews = useMemo<ViewName[]>(() => {
    if (job) {
      const set = new Set(job.results.map(r => r.view as ViewName));
      const ordered = VIEW_ORDER.filter(v => set.has(v));
      return ordered.length > 0 ? ordered : ['front'];
    }
    const v = form.getFieldValue('imagesCount');
    return v === '4' ? [...VIEW_ORDER] : ['front'];
  }, [job, results, form]);

  const addDesigns = (files: RcFile[] | File[]) => {
    const filtered = Array.from(files).filter(f => isImage(f.name)) as RcFile[];
    if (filtered.length === 0) {
      message.warning('No image files found in selection.');
      return;
    }
    setDesignFiles(prev => [...prev, ...filtered]);
  };

  const addDesign = (file: RcFile) => {
    setDesignFiles(prev => [...prev, file]);
    return false;
  };

  const onPickFolder = () => folderInputRef.current?.click();

  const onFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    addDesigns(Array.from(list) as RcFile[]);
    // reset so picking the same folder again re-triggers onChange
    e.target.value = '';
  };

  const onZipPicked = (file: RcFile) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.error('Please pick a .zip file.');
      return false;
    }
    setZipFile(file);
    return false;
  };

  const buildFormData = (values: any, forBulk: boolean): FormData => {
    const fd = new FormData();
    designFiles.forEach(f => fd.append('designs', f));
    if (forBulk && zipFile) fd.append('archive', zipFile);
    if (patternFile) fd.append('pattern', patternFile);
    if (broachFile) fd.append('broach', broachFile);
    if (colorImageFile) fd.append('color_image', colorImageFile);
    fd.append('gender', values.gender);
    fd.append('bodytype', values.bodytype);
    fd.append('imagesCount', values.imagesCount);
    if (values.broach_placement) fd.append('broach_placement', values.broach_placement);
    if (values.special_instructions) fd.append('special_instructions', values.special_instructions);
    return fd;
  };

  const handleGenerate = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }

    if (!designFiles.length && !zipFile) {
      message.error('Please upload at least one garment image, a folder, or a .zip.');
      return;
    }

    const values = form.getFieldsValue();
    setError(null);
    setResults([]);
    setJob(null);
    setLoading(true);

    const token = localStorage.getItem('authToken');

    try {
      if (!isBulkMode) {
        // ── Synchronous path: existing /generate endpoint ───────────────────
        startFakeProgress();
        const res = await fetch(`${API_BASE}/model-generation/generate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: buildFormData(values, false),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');
        setResults(data.results);
        message.success(`${data.count} image${data.count !== 1 ? 's' : ''} generated successfully!`);
        stopFakeProgress();
        setLoading(false);
        return;
      }

      // ── Bulk path: create job, then poll ────────────────────────────────
      const res = await fetch(`${API_BASE}/model-generation/bulk/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(values, true),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');

      message.success(`Job created: ${data.totalImages} image(s), ${data.totalTasks} task(s). Generating in the background...`);
      localStorage.setItem(ACTIVE_JOB_KEY, data.jobId);
      startPolling(data.jobId, token);
      loadRecentJobs();
    } catch (err: any) {
      setError(err.message || 'Generation failed. Please try again.');
      stopFakeProgress();
      setLoading(false);
    }
  };

  // Apply a job snapshot to component state (no side-effects beyond setState).
  const applyJobUpdate = (j: JobSummary) => {
    setJob(j);
    const pct = j.total > 0 ? Math.round(((j.done + j.failed) / j.total) * 100) : 0;
    setProgress(pct);
    const done = j.results.filter(r => r.status === 'DONE' && r.url);
    setResults(done.map(r => ({ file: r.fileName, view: r.view, url: r.url!, source: r.sourceUrl })));
  };

  // Continuously poll a job until it reaches a terminal status. Used by both
  // "start a new job" and "resume after tab switch."
  const startPolling = (jobId: string, token: string | null) => {
    stopPolling();
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/model-generation/bulk/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to poll job');
        const j: JobSummary = data.job;
        applyJobUpdate(j);

        if (!isActiveStatus(j.status)) {
          stopPolling();
          setLoading(false);
          if (localStorage.getItem(ACTIVE_JOB_KEY) === jobId) localStorage.removeItem(ACTIVE_JOB_KEY);
          if (j.status === 'DONE') message.success(`All ${j.done} image(s) generated!`);
          else if (j.status === 'PARTIAL') message.warning(`${j.done} succeeded, ${j.failed} failed.`);
          else message.error('Job failed. ' + (j.error || ''));
          loadRecentJobs();
        }
      } catch (err: any) {
        stopPolling();
        setLoading(false);
        setError(err.message || 'Lost connection to job.');
      }
    };
    tick();
    pollTimerRef.current = setInterval(tick, 3000);
  };

  // Resume a job after a tab switch / page reload (called from useEffect on mount).
  const resumeJob = async (jobId: string, token: string | null) => {
    try {
      const res = await fetch(`${API_BASE}/model-generation/bulk/job/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (localStorage.getItem(ACTIVE_JOB_KEY) === jobId) localStorage.removeItem(ACTIVE_JOB_KEY);
        return;
      }
      const j: JobSummary = data.job;
      applyJobUpdate(j);
      if (isActiveStatus(j.status)) {
        setLoading(true);
        startPolling(jobId, token);
      } else {
        if (localStorage.getItem(ACTIVE_JOB_KEY) === jobId) localStorage.removeItem(ACTIVE_JOB_KEY);
      }
    } catch {
      // silent — user can click the job in the Recent panel to retry
    }
  };

  // Click handler for "View" in the Recent Jobs panel.
  const viewJob = async (jobId: string) => {
    setError(null);
    const token = localStorage.getItem('authToken');
    await resumeJob(jobId, token);
  };

  const cancelJob = async () => {
    if (!job) return;
    const token = localStorage.getItem('authToken');
    try {
      await fetch(`${API_BASE}/model-generation/bulk/job/${job.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      message.info('Cancel requested. The current task will finish first.');
    } catch {
      message.error('Failed to cancel.');
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    } catch {
      message.error('Download failed');
    }
  };

  const downloadAll = async () => {
    // Bulk jobs have all outputs sitting on the server — ask the server to zip them
    // and stream back a single .zip. Way faster than N download dialogs.
    if (job) {
      const token = localStorage.getItem('authToken');
      const hide = message.loading('Building zip…', 0);
      try {
        const res = await fetch(`${API_BASE}/model-generation/bulk/job/${job.id}/download-zip`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          let errText = 'Zip download failed';
          try { const j = await res.json(); errText = j?.error || errText; } catch { /* not json */ }
          throw new Error(errText);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${job.id}.zip`;
        a.click();
        URL.revokeObjectURL(objectUrl);
        message.success(`Downloaded ${results.length} image${results.length !== 1 ? 's' : ''} as zip.`);
      } catch (err: any) {
        message.error(err?.message || 'Failed to download zip');
      } finally {
        hide();
      }
      return;
    }

    // Synchronous (non-bulk) flow — there's no per-job folder on the server, so
    // fall back to looping individual downloads. Counts are small here (≤ 20 files).
    for (const img of results) {
      const filename = `${img.file.split('.')[0]}_${img.view.replace(/\s+/g, '_')}.png`;
      await downloadImage(`${SERVER_BASE}${img.url}`, filename);
    }
  };

  const beforeUpload = (setter: (f: RcFile) => void) => (file: RcFile) => {
    setter(file);
    return false;
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <CameraOutlined style={{ marginRight: 10, color: '#1677ff' }} />
          AI Model Generation
        </Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          Upload garment images and generate professional fashion model photos using AI.
        </Paragraph>
      </div>

      <Row gutter={24}>
        {/* LEFT — Config Panel */}
        <Col xs={24} lg={9}>
          <Card title="Generation Settings" style={{ position: 'sticky', top: 80 }}>
            <Form form={form} layout="vertical" initialValues={{ gender: 'female', bodytype: 'Full-Body', imagesCount: '1' }}>
              {/* Garment Images */}
              <Form.Item label={<Text strong>Garment Images</Text>} required>
                <Dragger
                  accept="image/*"
                  multiple
                  beforeUpload={addDesign}
                  showUploadList={false}
                  style={{ padding: '8px 0' }}
                >
                  <p className="ant-upload-drag-icon" style={{ margin: '8px 0' }}>
                    <InboxOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 13 }}>Click or drag garment images here</p>
                </Dragger>

                <Space style={{ marginTop: 8, width: '100%' }} wrap>
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={onPickFolder}>
                    Pick Folder
                  </Button>
                  <Upload
                    accept=".zip,application/zip"
                    beforeUpload={onZipPicked}
                    showUploadList={false}
                    maxCount={1}
                  >
                    <Button size="small" icon={<FileZipOutlined />}>
                      {zipFile ? `Zip: ${zipFile.name}` : 'Upload ZIP'}
                    </Button>
                  </Upload>
                  {zipFile && (
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setZipFile(null)}>
                      Remove zip
                    </Button>
                  )}
                </Space>

                {/* Hidden folder input — webkitdirectory is non-standard, cast to any to satisfy TS */}
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  style={{ display: 'none' }}
                  onChange={onFolderInputChange}
                />

                {(designFiles.length > 0 || zipFile) && (
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                    {designFiles.length > 0 && (
                      <div style={{ fontSize: 11, color: '#888', padding: '4px 0' }}>
                        {designFiles.length} image{designFiles.length !== 1 ? 's' : ''} selected
                        {isBulkMode && <Tag color="orange" style={{ marginLeft: 8, fontSize: 10 }}>Bulk mode</Tag>}
                      </div>
                    )}
                    {designFiles.slice(0, 8).map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: f.name }}>{f.name}</Text>
                        <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={() => setDesignFiles(prev => prev.filter((_, j) => j !== i))} />
                      </div>
                    ))}
                    {designFiles.length > 8 && (
                      <Text type="secondary" style={{ fontSize: 11 }}>… and {designFiles.length - 8} more</Text>
                    )}
                    {designFiles.length > 0 && (
                      <Button size="small" type="link" danger onClick={() => setDesignFiles([])} style={{ padding: 0, marginTop: 4 }}>
                        Clear all
                      </Button>
                    )}
                  </div>
                )}
              </Form.Item>

              <Form.Item name="gender" label={<Text strong>Gender</Text>} rules={[{ required: true }]}>
                <Select options={GENDER_OPTIONS} />
              </Form.Item>

              <Form.Item name="bodytype" label={<Text strong>Body Type</Text>} rules={[{ required: true }]}>
                <Select options={BODYTYPE_OPTIONS} />
              </Form.Item>

              <Form.Item name="imagesCount" label={<Text strong>Views</Text>}>
                <Radio.Group>
                  <Radio value="1">Single (Front only)</Radio>
                  <Radio value="4">All Views (Front / Back / Side / Closeup)</Radio>
                </Radio.Group>
              </Form.Item>

              <Divider style={{ margin: '8px 0 16px' }}>Optional</Divider>

              <Form.Item label={<Text>Pattern Image</Text>}>
                <Upload accept="image/*" beforeUpload={beforeUpload(f => setPatternFile(f))} showUploadList={false} maxCount={1}>
                  <Button icon={<UploadOutlined />} size="small">
                    {patternFile ? patternFile.name : 'Upload Pattern'}
                  </Button>
                </Upload>
                {patternFile && (
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setPatternFile(null)} style={{ marginLeft: 4 }} />
                )}
              </Form.Item>

              <Form.Item label={<Text>Accessory / Broach Image</Text>}>
                <Upload accept="image/*" beforeUpload={beforeUpload(f => setBroachFile(f))} showUploadList={false} maxCount={1}>
                  <Button icon={<UploadOutlined />} size="small">
                    {broachFile ? broachFile.name : 'Upload Accessory'}
                  </Button>
                </Upload>
                {broachFile && (
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setBroachFile(null)} style={{ marginLeft: 4 }} />
                )}
              </Form.Item>

              <Form.Item name="broach_placement" label={<Text>Broach Placement</Text>}>
                <Select allowClear placeholder="e.g. left chest" options={[
                  { label: 'Left Chest', value: 'left chest' },
                  { label: 'Right Chest', value: 'right chest' },
                  { label: 'Center', value: 'center' },
                  { label: 'Collar', value: 'collar' },
                ]} />
              </Form.Item>

              <Form.Item label={<Text>Color Attachment (image lock)</Text>} help={
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Upload a reference image. The garment will be recolored to match the dominant color of this image.
                </Text>
              }>
                <Space align="start">
                  <Upload
                    accept="image/*"
                    beforeUpload={beforeUpload(f => setColorImageFile(f))}
                    showUploadList={false}
                    maxCount={1}
                  >
                    <Button icon={<UploadOutlined />} size="small">
                      {colorImageFile ? colorImageFile.name : 'Upload Color Reference'}
                    </Button>
                  </Upload>
                  {colorImageFile && (
                    <>
                      <img
                        src={URL.createObjectURL(colorImageFile)}
                        alt="color reference"
                        style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9' }}
                      />
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setColorImageFile(null)} />
                    </>
                  )}
                </Space>
              </Form.Item>

              <Form.Item name="special_instructions" label={<Text>Special Instructions</Text>}>
                <TextArea rows={2} placeholder="Any specific requirements..." />
              </Form.Item>

              <Button
                type="primary"
                block
                size="large"
                icon={<ThunderboltOutlined />}
                onClick={handleGenerate}
                loading={loading}
                disabled={!designFiles.length && !zipFile}
              >
                {loading ? (isBulkMode ? 'Processing job...' : 'Generating...') : (isBulkMode ? 'Start Bulk Job' : 'Generate Models')}
              </Button>

              {loading && progress > 0 && (
                <Progress percent={progress} size="small" style={{ marginTop: 12 }} strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }} />
              )}

              {job && (
                <Card size="small" style={{ marginTop: 12 }} bodyStyle={{ padding: 12 }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Text style={{ fontSize: 12 }}>
                      Job <Text code style={{ fontSize: 11 }}>{job.id.slice(0, 16)}…</Text>
                    </Text>
                    <Text style={{ fontSize: 12 }}>
                      Status: <Tag color={
                        job.status === 'DONE' ? 'green' :
                        job.status === 'FAILED' ? 'red' :
                        job.status === 'PARTIAL' ? 'orange' :
                        'blue'
                      }>{job.status}</Tag>
                    </Text>
                    <Text style={{ fontSize: 12 }}>
                      {job.done}/{job.total} done · {job.failed} failed · {job.running} running · {job.pending} pending
                    </Text>
                    {loading && (
                      <Button size="small" danger onClick={cancelJob}>Cancel job</Button>
                    )}
                  </Space>
                </Card>
              )}
            </Form>
          </Card>
        </Col>

        {/* RIGHT — Results Panel */}
        <Col xs={24} lg={15}>
          {/* Recent bulk jobs — survives tab switches; click any to view its results */}
          {recentJobs.length > 0 && (
            <Card
              size="small"
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  <HistoryOutlined />
                  <Text strong>Recent Bulk Jobs</Text>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  type="text"
                  icon={<ReloadOutlined spin={recentLoading} />}
                  onClick={loadRecentJobs}
                />
              }
              styles={{ body: { padding: '4px 12px', maxHeight: 240, overflowY: 'auto' } }}
            >
              {recentJobs.map(rj => {
                const pct = rj.total > 0 ? Math.round(((rj.done + rj.failed) / rj.total) * 100) : 0;
                const isActive = isActiveStatus(rj.status);
                const isCurrent = job?.id === rj.id;
                return (
                  <div
                    key={rj.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: '1px solid #f0f0f0',
                      background: isCurrent ? '#e6f4ff' : undefined,
                    }}
                  >
                    <Tag
                      color={
                        rj.status === 'DONE' ? 'green' :
                        rj.status === 'FAILED' ? 'red' :
                        rj.status === 'PARTIAL' ? 'orange' :
                        'blue'
                      }
                      style={{ fontSize: 10, margin: 0, minWidth: 64, textAlign: 'center' }}
                    >
                      {rj.status}
                    </Tag>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 11, display: 'block' }} ellipsis={{ tooltip: rj.id }}>
                        {rj.id.slice(0, 22)}…
                      </Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {rj.done}/{rj.total} done · {rj.failed} failed · {new Date(rj.createdAt).toLocaleTimeString()}
                      </Text>
                      {isActive && (
                        <Progress percent={pct} size="small" showInfo={false} style={{ marginTop: 2 }} />
                      )}
                    </div>
                    <Button
                      size="small"
                      type={isCurrent ? 'primary' : 'default'}
                      icon={<EyeOutlined />}
                      onClick={() => viewJob(rj.id)}
                    >
                      View
                    </Button>
                  </div>
                );
              })}
            </Card>
          )}

          {error && (
            <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} style={{ marginBottom: 16 }} />
          )}

          {loading && garmentRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" />
              <Paragraph type="secondary" style={{ marginTop: 16 }}>
                {isBulkMode
                  ? 'Bulk job running — images appear here as they finish. Pacing keeps Gemini below its rate limit.'
                  : 'AI is generating your fashion models. This may take 30–90 seconds...'}
              </Paragraph>
            </div>
          )}

          {!loading && garmentRows.length === 0 && !error && (
            <Card style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary">
                    Upload garment images, a folder, or a .zip and click <strong>Generate</strong> to get started.
                  </Text>
                }
              />
            </Card>
          )}

          {garmentRows.length > 0 && (
            <Card
              title={
                <Space>
                  <Text strong>{results.length} Generated Image{results.length !== 1 ? 's' : ''}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>· {garmentRows.length} garment{garmentRows.length !== 1 ? 's' : ''}</Text>
                  {loading && <Spin size="small" />}
                </Space>
              }
              extra={
                <Button icon={<DownloadOutlined />} size="small" onClick={downloadAll}>
                  Download All
                </Button>
              }
            >
              {/* One row per garment — [source | front | back | left side | closeup] */}
              {garmentRows.map(row => {
                const columnsCount = visibleViews.length + 1; // +1 for source
                return (
                  <Card
                    key={row.fileName}
                    size="small"
                    style={{ marginBottom: 12 }}
                    bodyStyle={{ padding: 8 }}
                    title={
                      <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: row.fileName }}>
                        {row.fileName}
                      </Text>
                    }
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnsCount}, 1fr)`,
                        gap: 8,
                      }}
                    >
                      {/* Source cell */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {row.source ? (
                          <Image
                            src={row.source.startsWith('blob:') ? row.source : `${SERVER_BASE}${row.source}`}
                            alt={`${row.fileName} - source`}
                            style={{ objectFit: 'cover', width: '100%', aspectRatio: '2/3' }}
                            preview={{ mask: 'Source' }}
                          />
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '2/3', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #d9d9d9' }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>no source</Text>
                          </div>
                        )}
                        <Tag color="default" style={{ fontSize: 10, alignSelf: 'flex-start' }}>Source</Tag>
                      </div>

                      {/* One cell per expected view */}
                      {visibleViews.map(view => {
                        const cell = row.cells[view];
                        const url = cell?.url;
                        const status = cell?.status;
                        return (
                          <div key={view} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {url && status === 'DONE' ? (
                              <>
                                <Image
                                  src={`${SERVER_BASE}${url}`}
                                  alt={`${row.fileName} - ${view}`}
                                  style={{ objectFit: 'cover', width: '100%', aspectRatio: '2/3' }}
                                  preview={{ mask: 'Preview' }}
                                />
                                <Space size={4} style={{ justifyContent: 'space-between' }}>
                                  <Tag color="blue" style={{ fontSize: 10 }}>{VIEW_LABELS[view] || view}</Tag>
                                  <Button
                                    size="small"
                                    type="text"
                                    icon={<DownloadOutlined />}
                                    onClick={() => downloadImage(
                                      `${SERVER_BASE}${url}`,
                                      `${row.fileName.split('.')[0]}_${view.replace(/\s+/g, '_')}.png`
                                    )}
                                  />
                                </Space>
                              </>
                            ) : (
                              <>
                                <div style={{
                                  width: '100%',
                                  aspectRatio: '2/3',
                                  background: status === 'FAILED' ? '#fff1f0' : '#fafafa',
                                  border: '1px dashed ' + (status === 'FAILED' ? '#ffa39e' : '#d9d9d9'),
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexDirection: 'column',
                                  gap: 4,
                                }}>
                                  {status === 'RUNNING' && <Spin size="small" />}
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {status === 'RUNNING' ? 'Generating…'
                                     : status === 'PENDING' ? 'Queued'
                                     : status === 'FAILED' ? 'Failed'
                                     : '—'}
                                  </Text>
                                </div>
                                <Tag
                                  color={status === 'FAILED' ? 'red' : 'default'}
                                  style={{ fontSize: 10, alignSelf: 'flex-start' }}
                                >
                                  {VIEW_LABELS[view] || view}
                                </Tag>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
