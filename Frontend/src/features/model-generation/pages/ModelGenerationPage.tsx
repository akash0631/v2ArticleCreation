import { useState, useRef } from 'react';
import {
  App, Card, Button, Form, Select, Radio, Upload, Input, Row, Col,
  Typography, Space, Spin, Alert, Image, Divider, Tag,
  Empty, Progress,
} from 'antd';
import {
  UploadOutlined, ThunderboltOutlined, DownloadOutlined, DeleteOutlined,
  CameraOutlined, InboxOutlined,
} from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
// Strip /api suffix to get the server root — used to resolve /uploads/... image paths
const SERVER_BASE = API_BASE.replace(/\/api$/, '');

interface GeneratedImage {
  file: string;
  view: string;
  url: string;
}

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
  'left side': 'Left Side',
  closeup: 'Closeup',
};

export default function ModelGenerationPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [designFiles, setDesignFiles] = useState<RcFile[]>([]);
  const [patternFile, setPatternFile] = useState<RcFile | null>(null);
  const [broachFile, setBroachFile] = useState<RcFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleGenerate = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }

    if (!designFiles.length) {
      message.error('Please upload at least one garment image.');
      return;
    }

    const values = form.getFieldsValue();
    setError(null);
    setResults([]);
    setLoading(true);
    startFakeProgress();

    try {
      const formData = new FormData();
      designFiles.forEach(f => formData.append('designs', f));
      if (patternFile) formData.append('pattern', patternFile);
      if (broachFile) formData.append('broach', broachFile);
      formData.append('gender', values.gender);
      formData.append('bodytype', values.bodytype);
      formData.append('imagesCount', values.imagesCount);
      if (values.broach_placement) formData.append('broach_placement', values.broach_placement);
      if (values.special_instructions) formData.append('special_instructions', values.special_instructions);
      if (values.color_name) formData.append('color_name', values.color_name);

      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/model-generation/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');

      setResults(data.results);
      message.success(`${data.count} image${data.count !== 1 ? 's' : ''} generated successfully!`);
    } catch (err: any) {
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setLoading(false);
      stopFakeProgress();
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
    for (const img of results) {
      const filename = `${img.file.split('.')[0]}_${img.view.replace(/\s+/g, '_')}.png`;
      await downloadImage(`${SERVER_BASE}${img.url}`, filename);
    }
  };

  const beforeUpload = (setter: (f: RcFile) => void) => (file: RcFile) => {
    setter(file);
    return false;
  };

  const addDesign = (file: RcFile) => {
    setDesignFiles(prev => [...prev, file]);
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
                {designFiles.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {designFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: f.name }}>{f.name}</Text>
                        <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={() => setDesignFiles(prev => prev.filter((_, j) => j !== i))} />
                      </div>
                    ))}
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

              <Form.Item name="color_name" label={<Text>Color Name (optional lock)</Text>}>
                <Input placeholder="e.g. Navy Blue" />
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
                disabled={!designFiles.length}
              >
                {loading ? 'Generating...' : 'Generate Models'}
              </Button>

              {loading && progress > 0 && (
                <Progress percent={progress} size="small" style={{ marginTop: 12 }} strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }} />
              )}
            </Form>
          </Card>
        </Col>

        {/* RIGHT — Results Panel */}
        <Col xs={24} lg={15}>
          {error && (
            <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} style={{ marginBottom: 16 }} />
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" />
              <Paragraph type="secondary" style={{ marginTop: 16 }}>
                AI is generating your fashion models. This may take 30–90 seconds...
              </Paragraph>
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <Card style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary">
                    Upload garment images and click <strong>Generate Models</strong> to get started.
                  </Text>
                }
              />
            </Card>
          )}

          {!loading && results.length > 0 && (
            <Card
              title={
                <Space>
                  <Text strong>{results.length} Generated Image{results.length !== 1 ? 's' : ''}</Text>
                </Space>
              }
              extra={
                <Button icon={<DownloadOutlined />} size="small" onClick={downloadAll}>
                  Download All
                </Button>
              }
            >
              <Row gutter={[16, 16]}>
                {results.map((img, i) => (
                  <Col key={i} xs={24} sm={12} md={8}>
                    <Card
                      hoverable
                      cover={
                        <Image
                          src={`${SERVER_BASE}${img.url}`}
                          alt={`${img.file} - ${img.view}`}
                          style={{ objectFit: 'cover', width: '100%', aspectRatio: '2/3' }}
                          preview={{ mask: 'Preview' }}
                        />
                      }
                      actions={[
                        <Button
                          key="dl"
                          type="text"
                          icon={<DownloadOutlined />}
                          size="small"
                          onClick={() => downloadImage(`${SERVER_BASE}${img.url}`, `${img.file.split('.')[0]}_${img.view.replace(/\s+/g, '_')}.png`)}
                        >
                          Download
                        </Button>,
                      ]}
                      styles={{ body: { padding: '8px 12px' } }}
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Tag color="blue" style={{ fontSize: 11 }}>{VIEW_LABELS[img.view] || img.view}</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: img.file }}>
                          {img.file}
                        </Text>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
