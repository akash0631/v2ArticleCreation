import { useEffect, useState, useCallback, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  User,
  CloudUpload,
  CheckCircle2,
  XCircle,
  RotateCw,
  DollarSign,
  ImageIcon,
  Eye,
  FileText,
  RefreshCw,
  Info,
  Search,
  Table as TableIcon,
  Inbox,
  Download,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  Popconfirm,
  Progress,
  Spinner,
  Statistic,
  Tag,
  type DataTableColumn,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { BackendApiService } from '../../../services/api/backendApi';
import { APP_CONFIG } from '../../../constants/app/config';

const api = new BackendApiService();

interface SrmSyncResult {
  inserted: number;
  skipped: number;
  errors: number;
  total: number;
  staged?: number; // rows staged to raw_articles (new pipeline, after 26 May 2026)
  completedAt?: string;
  ranAt?: string;
}

interface SrmStatus {
  totalInDb: number;
  lastSyncAt: string | null;
  pendingEnrichment: number;
  hiddenFromApprovers: number;
  divisionBreakdown: { division: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  nextScheduledSyncs: { istTime: string; utc: string }[];
  schedule: string;
  lastSyncResult?: SrmSyncResult | null;
}

interface VendorMasterStatus {
  count: number;
  lastSyncedAt: string | null;
}

interface MajCatGridMeta {
  uploadedAt?: string;
  fileName?: string;
  totalRows?: number;
  skippedRows?: number;
  inactiveSkipped?: number;
  categoriesCount?: number;
  attributesCount?: number;
  totalValues?: number;
}

interface MandatoryGridMeta {
  uploadedAt?: string;
  fileName?: string;
  totalRows?: number;
  skippedRows?: number;
  categoriesCount?: number;
  attributesCount?: number;
  activeMappings?: number;
  totalMappings?: number;
  totalValues?: number;
}

interface HierarchyExcelStatus {
  departments: number;
  subDepartments: number;
  categories: number;
}
interface HierarchyUploadResult {
  departments: { new: number; updated: number; total: number };
  subDepartments: { new: number; updated: number; total: number };
  categories: { new: number; updated: number; total: number };
  skippedRows: number;
  dryRun: boolean;
  preview?: { divisions: string[]; subDivisions: string[]; majorCategories: string[] };
}

interface PipelineStatusData {
  PENDING: number;
  PROCESSING: number;
  COMPLETED: number;
  FAILED: number;
  PERM_FAILED: number;
  total: number;
}

interface TestApiResult {
  // date-mode fields
  after_date?: string;
  total_from_api?: number;
  date_filtered?: number;
  matched?: number;
  // ppt-mode fields
  ppt_no?: string;
  // shared
  inserted: number;
  skipped: number;
  errors: number;
  message?: string;
}

interface PptSingleResult {
  refNo: string;
  imageCount: number;
  inserted: number;
  skipped: number;
  errors: number;
  vlmQueued: number;
}

const RAW_ARTICLES_MIN_DATE = dayjs('2026-05-27');

export default function Admin() {
  const [stats, setStats] = useState({ totalUploads: 0, completed: 0, failed: 0, pending: 0 });
  const [expenseData, setExpenseData] = useState<any>(null);
  const [imageData, setImageData] = useState<any>(null);
  const [detailedExpenses, setDetailedExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);

  // SRM
  const srmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [srmStatus, setSrmStatus] = useState<SrmStatus | null>(null);
  const [srmStatusLoading, setSrmStatusLoading] = useState(false);
  const [srmSyncing, setSrmSyncing] = useState(false);
  const [srmEnriching, setSrmEnriching] = useState(false);
  const [srmLastResult, setSrmLastResult] = useState<SrmSyncResult | null>(null);
  const [srmEnrichMessage, setSrmEnrichMessage] = useState<string | null>(null);

  // Single PPT fetch (08ac07b)
  const [pptRefNo, setPptRefNo] = useState('');
  const [pptSyncing, setPptSyncing] = useState(false);
  const [pptResult, setPptResult] = useState<PptSingleResult | null>(null);
  const [pptError, setPptError] = useState<string | null>(null);

  // Vendor
  const [vendorStatus, setVendorStatus] = useState<VendorMasterStatus | null>(null);
  const [vendorStatusLoading, setVendorStatusLoading] = useState(false);
  const [vendorSyncing, setVendorSyncing] = useState(false);

  // raw_articles pipeline (test API)
  const [testFetchMode, setTestFetchMode] = useState<'date' | 'ppt'>('date');
  const [testAfterDate, setTestAfterDate] = useState<Dayjs | null>(RAW_ARTICLES_MIN_DATE);
  const [testPptInput, setTestPptInput] = useState('');
  const [testFetching, setTestFetching] = useState(false);
  const [testResult, setTestResult] = useState<TestApiResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusData | null>(null);
  const [pipelineStatusLoading, setPipelineStatusLoading] = useState(false);
  const [extractionRunning, setExtractionRunning] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);

  // Maj-Cat Grid
  const [majCatGridMeta, setMajCatGridMeta] = useState<MajCatGridMeta | null>(null);
  const [majCatGridStatusLoading, setMajCatGridStatusLoading] = useState(false);
  const [majCatGridUploading, setMajCatGridUploading] = useState(false);
  const [majCatGridProgress, setMajCatGridProgress] = useState<number>(0);
  const majCatFileRef = useRef<HTMLInputElement | null>(null);

  // Mandatory Grid
  const [mandatoryGridMeta, setMandatoryGridMeta] = useState<MandatoryGridMeta | null>(null);
  const [mandatoryGridStatusLoading, setMandatoryGridStatusLoading] = useState(false);
  const [mandatoryGridUploading, setMandatoryGridUploading] = useState(false);
  const [mandatoryGridProgress, setMandatoryGridProgress] = useState<number>(0);
  const mandatoryFileRef = useRef<HTMLInputElement | null>(null);

  // Hierarchy Excel Upload (two-step)
  const [hierarchyExcelStatus, setHierarchyExcelStatus] = useState<HierarchyExcelStatus | null>(null);
  const [hierarchyExcelStatusLoading, setHierarchyExcelStatusLoading] = useState(false);
  const [hierarchyExcelUploading, setHierarchyExcelUploading] = useState(false);
  const [hierarchyExcelProgress, setHierarchyExcelProgress] = useState<number>(0);
  const [hierarchyPreview, setHierarchyPreview] = useState<HierarchyUploadResult | null>(null);
  const [hierarchyResult, setHierarchyResult] = useState<HierarchyUploadResult | null>(null);
  const [hierarchyPendingFile, setHierarchyPendingFile] = useState<File | null>(null);
  const hierarchyFileRef = useRef<HTMLInputElement | null>(null);

  // ─────────────────────────────── SRM ───────────────────────────────
  const loadSrmStatus = useCallback(async (stopPollOnResult = false) => {
    setSrmStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load SRM status');
      setSrmStatus(data.data);
      if (data.data?.lastSyncResult) {
        setSrmLastResult(data.data.lastSyncResult);
        if (stopPollOnResult && srmPollRef.current) {
          clearInterval(srmPollRef.current);
          srmPollRef.current = null;
        }
      }
    } catch (err: any) {
      message.error(err?.message || 'Failed to load SRM status');
    } finally {
      setSrmStatusLoading(false);
    }
  }, []);

  const runSrmEnrich = async () => {
    setSrmEnriching(true);
    setSrmEnrichMessage(null);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/enrich`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrichment trigger failed');
      setSrmEnrichMessage(data.message);
      message.success(data.message);
      await loadSrmStatus();
    } catch (err: any) {
      message.error(err?.message || 'Enrichment trigger failed');
    } finally {
      setSrmEnriching(false);
    }
  };

  const runSrmSyncByRef = async () => {
    const ref = pptRefNo.trim().toUpperCase();
    if (!ref) {
      message.warning('Enter a PPT number first (e.g. PRES-00721)');
      return;
    }
    setPptSyncing(true);
    setPptResult(null);
    setPptError(null);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/sync-by-ref`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ refNo: ref }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch presentation');
      setPptResult(data.data);
      message.success(`Fetched ${data.data.imageCount} images for ${ref}`);
    } catch (err: any) {
      setPptError(err?.message || 'Failed to fetch presentation');
      message.error(err?.message || 'Failed to fetch presentation');
    } finally {
      setPptSyncing(false);
    }
  };

  const runSrmSync = async () => {
    setSrmSyncing(true);
    setSrmLastResult(null);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SRM sync failed');

      if (res.status === 202) {
        message.info('Sync started in background. Results will appear here once complete (~1-2 min).');
        let attempts = 0;
        if (srmPollRef.current) clearInterval(srmPollRef.current);
        srmPollRef.current = setInterval(async () => {
          attempts++;
          await loadSrmStatus(true);
          if (attempts >= 12 && srmPollRef.current) {
            clearInterval(srmPollRef.current);
            srmPollRef.current = null;
          }
        }, 15000);
      } else {
        setSrmLastResult({
          inserted: data.inserted,
          skipped: data.skipped,
          errors: data.errors,
          total: data.total,
          staged: data.staged ?? 0,
        });
        const stagedMsg = (data.staged ?? 0) > 0 ? `, ${data.staged} staged to raw_articles` : '';
        message.success(`SRM sync complete — ${data.inserted} inserted${stagedMsg}, ${data.skipped} skipped`);
        await loadSrmStatus();
      }
    } catch (err: any) {
      message.error(err?.message || 'SRM sync failed');
    } finally {
      setSrmSyncing(false);
    }
  };

  // ─────────────────────────────── Vendor ───────────────────────────────
  const loadVendorStatus = useCallback(async () => {
    setVendorStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/vendor-master/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load vendor master status');
      setVendorStatus(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load vendor master status');
    } finally {
      setVendorStatusLoading(false);
    }
  }, []);

  const runVendorSync = async () => {
    setVendorSyncing(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/vendor-master/sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vendor master sync failed');
      message.success('Vendor master sync started in background. Records will update shortly.');
      setTimeout(() => loadVendorStatus(), 5000);
    } catch (err: any) {
      message.error(err?.message || 'Vendor master sync failed');
    } finally {
      setVendorSyncing(false);
    }
  };

  // ─────────────────────────────── raw_articles Pipeline ───────────────────────────────
  const loadPipelineStatus = useCallback(async () => {
    setPipelineStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/test-api/pipeline-status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load pipeline status');
      setPipelineStatus(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load pipeline status');
    } finally {
      setPipelineStatusLoading(false);
    }
  }, []);

  const runTestApiFetch = async () => {
    if (testFetchMode === 'date') {
      if (!testAfterDate) {
        message.warning('Select a date first');
        return;
      }
    } else {
      if (!testPptInput.trim()) {
        message.warning('Enter a PPT number first (e.g. PRES-00831)');
        return;
      }
    }

    setTestFetching(true);
    setTestResult(null);
    setTestError(null);
    try {
      const token = localStorage.getItem('authToken');
      let url: string;
      let body: object;

      if (testFetchMode === 'date') {
        url = `${APP_CONFIG.api.baseURL}/test-api/fetch-presentation`;
        body = { after_date: testAfterDate!.format('YYYY-MM-DD') };
      } else {
        url = `${APP_CONFIG.api.baseURL}/test-api/fetch-by-ppt`;
        body = { ppt_no: testPptInput.trim().toUpperCase() };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch presentations');
      setTestResult(data);
      message.success(`${data.inserted} new row(s) saved to raw_articles`);
      loadPipelineStatus();
    } catch (err: any) {
      setTestError(err?.message || 'Failed to fetch presentations');
      message.error(err?.message || 'Failed to fetch presentations');
    } finally {
      setTestFetching(false);
    }
  };

  const triggerExtraction = async () => {
    setExtractionRunning(true);
    setExtractionMessage(null);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/test-api/run-extraction`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start extraction');
      setExtractionMessage(data.message);
      message.success(data.message);
      let polls = 0;
      const pollInterval = setInterval(async () => {
        polls++;
        await loadPipelineStatus();
        if (polls >= 12) clearInterval(pollInterval);
      }, 15000);
    } catch (err: any) {
      message.error(err?.message || 'Failed to start extraction');
    } finally {
      setExtractionRunning(false);
    }
  };

  // ─────────────────────────────── Maj-Cat Grid ───────────────────────────────
  const downloadMajCatTemplate = () => {
    const token = localStorage.getItem('authToken');
    const url = `${APP_CONFIG.api.baseURL}/admin/majcat-grid/template`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'MAJ_CAT_GRID_TEMPLATE.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => message.error('Failed to download template'));
  };

  const loadMajCatGridStatus = useCallback(async () => {
    setMajCatGridStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/majcat-grid/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load grid status');
      setMajCatGridMeta(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load maj-cat grid status');
    } finally {
      setMajCatGridStatusLoading(false);
    }
  }, []);

  const handleMajCatGridUpload = async (file: File) => {
    setMajCatGridUploading(true);
    setMajCatGridProgress(0);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('file', file);
      const progressInterval = setInterval(() => {
        setMajCatGridProgress((prev) => Math.min(prev + 3, 90));
      }, 800);
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/majcat-grid/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      clearInterval(progressInterval);
      setMajCatGridProgress(100);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      message.success(data.message);
      setMajCatGridMeta(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Upload failed');
    } finally {
      setMajCatGridUploading(false);
      setTimeout(() => setMajCatGridProgress(0), 1500);
      if (majCatFileRef.current) majCatFileRef.current.value = '';
    }
  };

  // ─────────────────────────────── Mandatory Grid ───────────────────────────────
  const loadMandatoryGridStatus = useCallback(async () => {
    setMandatoryGridStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/mandatory-grid/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load mandatory grid status');
      setMandatoryGridMeta(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load mandatory grid status');
    } finally {
      setMandatoryGridStatusLoading(false);
    }
  }, []);

  const downloadMandatoryTemplate = () => {
    const token = localStorage.getItem('authToken');
    const url = `${APP_CONFIG.api.baseURL}/admin/mandatory-grid/template`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mandatory-grid-template.xlsx';
        a.click();
      })
      .catch(() => message.error('Failed to download template'));
  };

  const handleMandatoryGridUpload = async (file: File) => {
    setMandatoryGridUploading(true);
    setMandatoryGridProgress(0);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('file', file);
      const progressInterval = setInterval(() => {
        setMandatoryGridProgress((prev) => Math.min(prev + 3, 90));
      }, 800);
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/mandatory-grid/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      clearInterval(progressInterval);
      setMandatoryGridProgress(100);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      message.success(data.message);
      setMandatoryGridMeta(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Upload failed');
    } finally {
      setMandatoryGridUploading(false);
      setTimeout(() => setMandatoryGridProgress(0), 1500);
      if (mandatoryFileRef.current) mandatoryFileRef.current.value = '';
    }
  };

  // ─────────────────────────────── Hierarchy Excel ───────────────────────────────
  const loadHierarchyExcelStatus = useCallback(async () => {
    setHierarchyExcelStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/hierarchy/excel-status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load hierarchy status');
      setHierarchyExcelStatus(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load hierarchy status');
    } finally {
      setHierarchyExcelStatusLoading(false);
    }
  }, []);

  const handleHierarchyPreview = async (file: File) => {
    setHierarchyExcelUploading(true);
    setHierarchyExcelProgress(0);
    setHierarchyPreview(null);
    setHierarchyResult(null);
    setHierarchyPendingFile(file);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('file', file);
      const progressInterval = setInterval(() => {
        setHierarchyExcelProgress((prev) => Math.min(prev + 8, 85));
      }, 300);
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/hierarchy/upload-excel?dryRun=true`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      clearInterval(progressInterval);
      setHierarchyExcelProgress(100);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setHierarchyPreview(data.data);
    } catch (err: any) {
      message.error(err?.message || 'Preview failed');
      setHierarchyPendingFile(null);
    } finally {
      setHierarchyExcelUploading(false);
      setTimeout(() => setHierarchyExcelProgress(0), 1000);
      if (hierarchyFileRef.current) hierarchyFileRef.current.value = '';
    }
  };

  const handleHierarchyConfirm = async () => {
    if (!hierarchyPendingFile) return;
    setHierarchyExcelUploading(true);
    setHierarchyExcelProgress(0);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('file', hierarchyPendingFile);
      const progressInterval = setInterval(() => {
        setHierarchyExcelProgress((prev) => Math.min(prev + 2, 90));
      }, 600);
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/hierarchy/upload-excel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      clearInterval(progressInterval);
      setHierarchyExcelProgress(100);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setHierarchyResult(data.data);
      setHierarchyPreview(null);
      setHierarchyPendingFile(null);
      message.success(data.message);
      await loadHierarchyExcelStatus();
    } catch (err: any) {
      message.error(err?.message || 'Import failed');
    } finally {
      setHierarchyExcelUploading(false);
      setTimeout(() => setHierarchyExcelProgress(0), 1500);
    }
  };

  // ─────────────────────────────── Boot ───────────────────────────────
  useEffect(() => {
    loadData();
    loadSrmStatus();
    loadVendorStatus();
    loadMajCatGridStatus();
    loadMandatoryGridStatus();
    loadHierarchyExcelStatus();
    loadPipelineStatus();
    return () => {
      if (srmPollRef.current) {
        clearInterval(srmPollRef.current);
        srmPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSrmStatus, loadVendorStatus, loadMajCatGridStatus, loadMandatoryGridStatus, loadHierarchyExcelStatus, loadPipelineStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [adminStats, expenses, images, detailed] = await Promise.all([
        api.getAdminStats(),
        api.getExpenseAnalytics(),
        api.getImageUsageAnalytics(),
        api.getDetailedExpenses({ limit: 500 }),
      ]);
      setStats(adminStats);
      setExpenseData(expenses);
      setImageData(images);
      setDetailedExpenses(detailed || []);
    } catch (error) {
      message.error('Failed to load admin data');
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runDescriptionBackfill = async () => {
    setBackfillLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const baseURL = APP_CONFIG.api.baseURL;
      const res = await fetch(
        `${baseURL}/approver/backfill-descriptions?fromDate=2026-04-10&toDate=${new Date().toISOString().slice(0, 10)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backfill failed');
      message.success(`Backfill complete — ${data.updated} article description(s) updated.`);
    } catch (err: any) {
      message.error(err?.message || 'Backfill failed');
    } finally {
      setBackfillLoading(false);
    }
  };

  const expenseColumns: DataTableColumn<any>[] = [
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Count', dataIndex: 'count', key: 'count' },
    {
      title: 'Total Cost',
      key: 'costPrice',
      render: (_v, record) => `$${record.totalCostPrice?.toFixed(2) || '0.00'}`,
    },
  ];

  const detailedExpenseColumns: DataTableColumn<any>[] = [
    {
      title: 'Image',
      key: 'image',
      width: 80,
      align: 'center',
      render: (_v, record) =>
        record.imageUrl ? (
          <Button variant="link" size="icon" onClick={() => window.open(record.imageUrl, '_blank')} title="View image">
            <Eye />
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      title: 'Article',
      dataIndex: 'imageName',
      key: 'imageName',
      render: (imageName: string, record) => record.articleNumber || imageName || '—',
    },
    {
      title: 'Input Tokens',
      dataIndex: 'inputTokens',
      key: 'inputTokens',
      align: 'right',
      render: (val: number) => val?.toLocaleString() || '0',
    },
    {
      title: 'Output Tokens',
      dataIndex: 'outputTokens',
      key: 'outputTokens',
      align: 'right',
      render: (val: number) => val?.toLocaleString() || '0',
    },
    {
      title: 'Total Tokens',
      key: 'totalTokens',
      align: 'right',
      render: (_v, record) => ((record.inputTokens || 0) + (record.outputTokens || 0)).toLocaleString(),
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      align: 'right',
      render: (val: number) => `$${val?.toFixed(4) || '0.0000'}`,
    },
  ];

  const statusBreakdownData = expenseData?.statusBreakdown
    ? Object.entries(expenseData.statusBreakdown).map(([status, data]: [string, any]) => ({
        key: status,
        status,
        count: data.count,
        totalCostPrice: data.totalCostPrice,
        totalSellingPrice: data.totalSellingPrice,
      }))
    : [];

  const categoryBreakdownData = imageData?.categoryBreakdown
    ? Object.entries(imageData.categoryBreakdown).map(([category, count]: [string, any]) => ({ key: category, category, count }))
    : [];

  return (
    <div className="page-scroll-enabled p-3">
      {/* ─── Gradient Header Strip ─── */}
      <div
        className="mb-5 flex items-center justify-between rounded-2xl px-6 py-4 text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #1f2937 0%, #334155 60%, #475569 100%)' }}
      >
        <div>
          <h1 className="m-0 text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="m-0 mt-0.5 text-xs text-white/60">System health, sync status &amp; analytics</p>
        </div>
        <Button onClick={loadData} disabled={loading} variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <RotateCw className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <Spinner spinning={loading}>
        {/* Main Statistics Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <Card className="glass card-3d rounded-2xl border border-white/60">
            <CardContent className="pt-6">
              <Statistic
                title="Total Uploads"
                value={stats.totalUploads}
                prefix={<CloudUpload className="h-5 w-5" />}
                valueStyle={{ color: '#FF6F61' }}
              />
            </CardContent>
          </Card>
          <Card className="glass card-3d rounded-2xl border border-white/60">
            <CardContent className="pt-6">
              <Statistic
                title="Completed"
                value={stats.completed}
                prefix={<CheckCircle2 className="h-5 w-5" />}
                valueStyle={{ color: '#10b981' }}
              />
            </CardContent>
          </Card>
          <Card className="glass card-3d rounded-2xl border border-white/60">
            <CardContent className="pt-6">
              <Statistic
                title="Failed"
                value={stats.failed}
                prefix={<XCircle className="h-5 w-5" />}
                valueStyle={{ color: '#e11d48' }}
              />
            </CardContent>
          </Card>
          <Card className="glass card-3d rounded-2xl border border-white/60">
            <CardContent className="pt-6">
              <Statistic
                title="Pending"
                value={stats.pending}
                prefix={<User className="h-5 w-5" />}
                valueStyle={{ color: '#faad14' }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Backfill Tools */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Data Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1">
                <strong>Backfill Article Descriptions</strong>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  Re-compute article descriptions for all articles created from <strong>10 Apr 2026</strong> to today using the current formula (YARN‑WEAVE‑MVGR‑LYCRA‑NECK‑SLEEVE…, max 40 chars).
                </div>
              </div>
              <Popconfirm
                title="Run description backfill?"
                description="This will overwrite existing article descriptions for articles from 10 Apr 2026 to today. Continue?"
                onConfirm={runDescriptionBackfill}
                okText="Yes, run it"
                cancelText="Cancel"
              >
                <Button disabled={backfillLoading}>
                  <FileText />
                  Run Backfill
                </Button>
              </Popconfirm>
            </div>
          </CardContent>
        </Card>

        {/* SRM Sync */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4" />
              SRM Presentation Sync
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => loadSrmStatus()} disabled={srmStatusLoading}>
              <RotateCw className={srmStatusLoading ? 'animate-spin' : ''} />
              Refresh Status
            </Button>
          </CardHeader>
          <CardContent>
            <Spinner spinning={srmStatusLoading}>
              {srmStatus ? (
                <>
                  <Descriptions bordered className="mb-4">
                    <Descriptions.Item label="Records in DB">
                      <strong className="text-lg">{srmStatus.totalInDb}</strong>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Sync">
                      {srmStatus.lastSyncAt
                        ? new Date(srmStatus.lastSyncAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }) + ' IST'
                        : <span className="text-muted-foreground">Never</span>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Schedule">{srmStatus.schedule}</Descriptions.Item>
                    <Descriptions.Item label="Division Breakdown">
                      <div className="flex flex-wrap gap-2">
                        {srmStatus.divisionBreakdown.map((d) => (
                          <Badge key={d.division} variant="info">{d.division}: {d.count}</Badge>
                        ))}
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="Approval Status">
                      <div className="flex flex-wrap gap-2">
                        {srmStatus.statusBreakdown.map((s) => (
                          <Badge
                            key={s.status}
                            variant={s.status === 'APPROVED' ? 'success' : s.status === 'REJECTED' ? 'destructive' : 'warning'}
                          >
                            {s.status}: {s.count}
                          </Badge>
                        ))}
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="Pending VLM Extraction">
                      {srmStatus.pendingEnrichment > 0 ? (
                        <Badge variant="destructive">{srmStatus.pendingEnrichment} records need extraction</Badge>
                      ) : (
                        <Badge variant="success">All records extracted</Badge>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Hidden from Approvers">
                      {srmStatus.hiddenFromApprovers > 0 ? (
                        <Badge variant="warning">{srmStatus.hiddenFromApprovers} extracting now</Badge>
                      ) : (
                        <Badge variant="success">None</Badge>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Next Syncs">
                      <div className="flex flex-wrap gap-3">
                        {srmStatus.nextScheduledSyncs.map((s) => (
                          <span key={s.istTime} className="inline-flex items-center gap-1">
                            <Badge variant="info">{s.istTime} IST</Badge>
                            <span className="text-xs text-muted-foreground">
                              ({new Date(s.utc).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })} IST)
                            </span>
                          </span>
                        ))}
                      </div>
                    </Descriptions.Item>
                  </Descriptions>

                  {srmLastResult && (srmLastResult.total > 0 || srmLastResult.inserted > 0) && (
                    <Alert
                      type={srmLastResult.errors > 0 ? 'warning' : 'success'}
                      showIcon
                      className="mb-3"
                      message={
                        <span>
                          Last Sync Result
                          {srmLastResult.completedAt && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · {new Date(srmLastResult.completedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
                            </span>
                          )}
                        </span>
                      }
                      description={
                        <span>
                          <strong className="text-emerald-600">{srmLastResult.inserted}</strong> records inserted (old pipeline) &nbsp;·&nbsp;
                          {(srmLastResult.staged ?? 0) > 0 && (
                            <>
                              <strong className="text-[#FF6F61]">{srmLastResult.staged}</strong> staged to raw_articles (new pipeline) &nbsp;·&nbsp;
                            </>
                          )}
                          <strong>{srmLastResult.skipped}</strong> already existed (skipped) &nbsp;·&nbsp;
                          <strong className={srmLastResult.errors > 0 ? 'text-rose-600' : ''}>{srmLastResult.errors}</strong> errors &nbsp;·&nbsp;
                          <strong>{srmLastResult.total}</strong> total from SRM API
                        </span>
                      }
                    />
                  )}

                  {srmEnrichMessage && (
                    <Alert
                      type="info"
                      showIcon
                      className="mb-3"
                      message="VLM Extraction Started"
                      description={srmEnrichMessage}
                    />
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="card-3d rounded-xl border border-white/60 bg-white/50 p-4 backdrop-blur-sm">
                      <div className="mb-1 font-semibold">Sync Presentations</div>
                      <div className="mb-2.5 text-xs text-muted-foreground">
                        Fetches all presentations from the SRM API and inserts any new records. Already-imported records are skipped.
                      </div>
                      <Popconfirm
                        title="Trigger SRM Sync?"
                        description="Fetch all presentations from the SRM API and insert new ones. VLM extraction will run after sync."
                        onConfirm={runSrmSync}
                        okText="Yes, sync now"
                        cancelText="Cancel"
                      >
                        <Button disabled={srmSyncing} className="w-full">
                          <RefreshCw className={srmSyncing ? 'animate-spin' : ''} />
                          {srmSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                      </Popconfirm>
                    </div>
                    <div className="rounded-md border border-border p-4">
                      <div className="mb-1 flex items-center gap-2 font-semibold">
                        Run VLM Extraction
                        {srmStatus.pendingEnrichment > 0 && (
                          <Badge variant="destructive">{srmStatus.pendingEnrichment} pending</Badge>
                        )}
                      </div>
                      <div className="mb-2.5 text-xs text-muted-foreground">
                        Runs AI attribute extraction on SRM records that have an image but haven't been extracted yet. Processes sequentially (~2s per record).
                      </div>
                      <Popconfirm
                        title="Run VLM extraction on SRM records?"
                        description={`This will extract attributes for ${srmStatus.pendingEnrichment} records. Runs in the background — may take several minutes.`}
                        onConfirm={runSrmEnrich}
                        okText="Yes, start extraction"
                        cancelText="Cancel"
                        disabled={srmStatus.pendingEnrichment === 0}
                      >
                        <Button
                          variant="outline"
                          disabled={srmEnriching || srmStatus.pendingEnrichment === 0}
                          className="w-full"
                        >
                          <RefreshCw className={srmEnriching ? 'animate-spin' : ''} />
                          {srmEnriching
                            ? 'Starting...'
                            : srmStatus.pendingEnrichment === 0
                            ? 'All Extracted'
                            : 'Extract Attributes'}
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                </>
              ) : (
                <Empty description="Could not load SRM sync status" />
              )}
            </Spinner>
          </CardContent>
        </Card>

        {/* Fetch by PPT No (single presentation, ported from 08ac07b) */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Fetch Presentation by PPT No
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-[13px] text-muted-foreground">
              Fetch a single SRM presentation by its reference number, insert all its images into the DB, and run Gemini VLM extraction automatically.
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Input
                placeholder="e.g. PRES-00721"
                value={pptRefNo}
                onChange={(e) => {
                  setPptRefNo(e.target.value.toUpperCase());
                  setPptResult(null);
                  setPptError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSrmSyncByRef();
                }}
                className="max-w-[220px] font-mono font-semibold"
                disabled={pptSyncing}
              />
              <Button onClick={runSrmSyncByRef} disabled={pptSyncing || !pptRefNo.trim()}>
                <RefreshCw className={pptSyncing ? 'animate-spin' : ''} />
                {pptSyncing ? 'Fetching...' : 'Fetch & Extract'}
              </Button>
            </div>

            {pptError && (
              <Alert type="error" showIcon className="mb-3" message="Error" description={pptError} />
            )}

            {pptResult && (
              <Alert
                type={pptResult.errors > 0 ? 'warning' : 'success'}
                showIcon
                message={
                  <span>
                    <strong>{pptResult.refNo}</strong>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {pptResult.imageCount} image{pptResult.imageCount !== 1 ? 's' : ''} in presentation
                    </span>
                  </span>
                }
                description={
                  <div className="mt-1 flex flex-wrap gap-3">
                    <span>
                      <strong className="text-emerald-600">{pptResult.inserted}</strong> new inserted
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      <strong>{pptResult.skipped}</strong> already existed (skipped)
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      <strong className={pptResult.errors > 0 ? 'text-rose-600' : ''}>{pptResult.errors}</strong> errors
                    </span>
                    {pptResult.vlmQueued > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span>
                          <strong className="text-[#FF6F61]">{pptResult.vlmQueued}</strong> queued for VLM extraction
                        </span>
                      </>
                    )}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* raw_articles Pipeline (test API — date/PPT fetch + pipeline status + run extraction) */}
        <Card className="mb-6 glass rounded-2xl border border-amber-300/60">
          <CardHeader className="flex flex-row items-center justify-between bg-amber-50/60">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              raw_articles Pipeline
            </CardTitle>
            <Button size="sm" variant="outline" onClick={loadPipelineStatus} disabled={pipelineStatusLoading}>
              <RotateCw className={pipelineStatusLoading ? 'animate-spin' : ''} />
              Refresh Status
            </Button>
          </CardHeader>
          <CardContent>
            {/* Pipeline status row */}
            <div className="mb-5">
              <div className="mb-2.5 text-[13px] font-semibold">Pipeline Status</div>
              {pipelineStatus ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <Tag className="px-2.5 py-0.5 text-[13px]" bgColor="#fef3c7" color="#92400e" borderColor="#fde68a">
                    PENDING: <strong className="ml-1">{pipelineStatus.PENDING}</strong>
                  </Tag>
                  <Tag className="px-2.5 py-0.5 text-[13px]" bgColor="#dbeafe" color="#1e40af" borderColor="#bfdbfe">
                    PROCESSING: <strong className="ml-1">{pipelineStatus.PROCESSING}</strong>
                  </Tag>
                  <Tag className="px-2.5 py-0.5 text-[13px]" bgColor="#d1fae5" color="#065f46" borderColor="#a7f3d0">
                    COMPLETED: <strong className="ml-1">{pipelineStatus.COMPLETED}</strong>
                  </Tag>
                  <Tag className="px-2.5 py-0.5 text-[13px]" bgColor="#fee2e2" color="#991b1b" borderColor="#fecaca">
                    FAILED: <strong className="ml-1">{pipelineStatus.FAILED}</strong>
                  </Tag>
                  <Tag className="px-2.5 py-0.5 text-[13px]" bgColor="#ffe4e0" color="#FF6F61" borderColor="#ffc7bf">
                    PERM_FAILED: <strong className="ml-1">{pipelineStatus.PERM_FAILED}</strong>
                  </Tag>
                  <Tag className="px-2.5 py-0.5 text-[13px]">
                    TOTAL: <strong className="ml-1">{pipelineStatus.total}</strong>
                  </Tag>
                  <Popconfirm
                    title="Run VLM Extraction?"
                    description="This will process up to 10 PENDING/FAILED rows, run VLM on each image, and push results to extraction_results_flat. Runs in background."
                    onConfirm={triggerExtraction}
                    okText="Yes, run now"
                    cancelText="Cancel"
                    disabled={pipelineStatus.PENDING + pipelineStatus.FAILED === 0}
                  >
                    <Button
                      disabled={extractionRunning || pipelineStatus.PENDING + pipelineStatus.FAILED === 0}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <RefreshCw className={extractionRunning ? 'animate-spin' : ''} />
                      {extractionRunning
                        ? 'Starting...'
                        : `Run Extraction (${pipelineStatus.PENDING + pipelineStatus.FAILED} queued)`}
                    </Button>
                  </Popconfirm>
                </div>
              ) : (
                <Spinner spinning={pipelineStatusLoading}>
                  <span className="text-[13px] text-muted-foreground">Loading pipeline status...</span>
                </Spinner>
              )}
              {extractionMessage && <Alert type="info" showIcon className="mt-2.5" message={extractionMessage} />}
            </div>

            <div className="mb-3 border-t border-border pt-4">
              <div className="mb-2 text-[13px] font-semibold">Fetch Presentations to raw_articles</div>
              <div className="mb-2.5 text-xs text-muted-foreground">
                Saves SRM presentations to <code className="rounded bg-muted px-1 py-0.5">raw_articles</code> as <strong>PENDING</strong> — no VLM triggered.
                {testFetchMode === 'date' && (
                  <span className="ml-1.5 text-amber-600">
                    ⚠ Only dates on or after <strong>27 May 2026</strong> allowed.
                  </span>
                )}
              </div>

              {/* Mode toggle */}
              <div className="mb-3 flex gap-2">
                <Button
                  size="sm"
                  variant={testFetchMode === 'date' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestFetchMode('date');
                    setTestResult(null);
                    setTestError(null);
                  }}
                >
                  By Date
                </Button>
                <Button
                  size="sm"
                  variant={testFetchMode === 'ppt' ? 'default' : 'outline'}
                  onClick={() => {
                    setTestFetchMode('ppt');
                    setTestResult(null);
                    setTestError(null);
                  }}
                >
                  By PPT Number
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {testFetchMode === 'date' ? (
                  <DatePicker
                    value={testAfterDate}
                    onChange={(val) => {
                      // enforce cutoff client-side too
                      if (val && val.isBefore(RAW_ARTICLES_MIN_DATE, 'day')) {
                        setTestAfterDate(RAW_ARTICLES_MIN_DATE);
                      } else {
                        setTestAfterDate(val);
                      }
                      setTestResult(null);
                      setTestError(null);
                    }}
                    placeholder="Received on or after"
                    className="max-w-[200px]"
                    disabled={testFetching}
                  />
                ) : (
                  <Input
                    placeholder="e.g. PRES-00831"
                    value={testPptInput}
                    onChange={(e) => {
                      setTestPptInput(e.target.value.toUpperCase());
                      setTestResult(null);
                      setTestError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runTestApiFetch();
                    }}
                    className="max-w-[200px] font-mono font-semibold"
                    disabled={testFetching}
                  />
                )}
                <Button
                  onClick={runTestApiFetch}
                  disabled={testFetching || (testFetchMode === 'date' ? !testAfterDate : !testPptInput.trim())}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  <Search className={testFetching ? 'animate-spin' : ''} />
                  {testFetching ? 'Fetching...' : 'Fetch to Raw Articles'}
                </Button>
              </div>
            </div>

            {testError && (
              <Alert type="error" showIcon className="mt-2.5" message="Error" description={testError} />
            )}

            {testResult && (
              <Alert
                type={testResult.errors > 0 ? 'warning' : (testResult.matched ?? testResult.inserted) === 0 ? 'info' : 'success'}
                showIcon
                className="mt-2.5"
                message={
                  testFetchMode === 'date' ? (
                    <span>
                      Results for <strong>{testResult.after_date}</strong> onwards
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        · {(testResult.total_from_api ?? 0).toLocaleString()} total from API · {(testResult.date_filtered ?? 0).toLocaleString()} too old ·{' '}
                        <strong>{(testResult.matched ?? 0).toLocaleString()}</strong> matched
                      </span>
                    </span>
                  ) : (
                    <span>
                      Results for <strong>{testResult.ppt_no}</strong> · <strong>{testResult.matched ?? 0}</strong> rows in SRM API
                    </span>
                  )
                }
                description={
                  <div className="mt-1 flex flex-wrap gap-3">
                    <span>
                      <strong className="text-emerald-600">{testResult.inserted}</strong> new rows inserted (PENDING)
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      <strong>{testResult.skipped}</strong> already existed (skipped)
                    </span>
                    {testResult.errors > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span>
                          <strong className="text-rose-600">{testResult.errors}</strong> errors
                        </span>
                      </>
                    )}
                    {testResult.message && (
                      <span className="italic text-muted-foreground">{testResult.message}</span>
                    )}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Vendor Master Sync */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4" />
              Vendor Master Sync
            </CardTitle>
            <Button size="sm" variant="outline" onClick={loadVendorStatus} disabled={vendorStatusLoading}>
              <RotateCw className={vendorStatusLoading ? 'animate-spin' : ''} />
              Refresh Status
            </Button>
          </CardHeader>
          <CardContent>
            <Spinner spinning={vendorStatusLoading}>
              {vendorStatus ? (
                <>
                  <Descriptions bordered className="mb-4">
                    <Descriptions.Item label="Records in DB">
                      <strong className="text-lg">{vendorStatus.count.toLocaleString()}</strong>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Sync">
                      {vendorStatus.lastSyncedAt
                        ? new Date(vendorStatus.lastSyncedAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }) + ' IST'
                        : <span className="text-muted-foreground">Never</span>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Schedule">Daily at 2:00 AM IST</Descriptions.Item>
                    <Descriptions.Item label="Source API">
                      <span className="font-mono text-xs text-muted-foreground">
                        https://my-dab-app.azurewebsites.net/api/ET_Supplier_Master
                      </span>
                    </Descriptions.Item>
                  </Descriptions>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="card-3d rounded-xl border border-white/60 bg-white/50 p-4 backdrop-blur-sm">
                      <div className="mb-1 font-semibold">Sync Vendor Master</div>
                      <div className="mb-2.5 text-xs text-muted-foreground">
                        Fetches all vendor records from the DAB API and upserts into the local database. Runs in background — page will auto-refresh status after 5s.
                      </div>
                      <Popconfirm
                        title="Trigger Vendor Master Sync?"
                        description="Fetch all vendors from the DAB API and upsert into master_vendor_details. This may take a minute."
                        onConfirm={runVendorSync}
                        okText="Yes, sync now"
                        cancelText="Cancel"
                      >
                        <Button disabled={vendorSyncing} className="w-full">
                          <RefreshCw className={vendorSyncing ? 'animate-spin' : ''} />
                          {vendorSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                </>
              ) : (
                <Empty description="Could not load vendor master status" />
              )}
            </Spinner>
          </CardContent>
        </Card>

        {/* Major-Category Grid Upload (dropdown values per major category, ported from c9e8839) */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TableIcon className="h-4 w-4" />
              Major Category Grid (Dropdown Values)
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={downloadMajCatTemplate}>
                <Download />
                Download Template
              </Button>
              <Button size="sm" variant="outline" onClick={loadMajCatGridStatus} disabled={majCatGridStatusLoading}>
                <RotateCw className={majCatGridStatusLoading ? 'animate-spin' : ''} />
                Refresh Status
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Spinner spinning={majCatGridStatusLoading}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* Status panel */}
                <div className="md:col-span-7">
                  {majCatGridMeta ? (
                    <Descriptions bordered>
                      <Descriptions.Item label="Last Upload">
                        {majCatGridMeta.uploadedAt
                          ? new Date(majCatGridMeta.uploadedAt).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }) + ' IST'
                          : <span className="text-muted-foreground">Unknown</span>}
                      </Descriptions.Item>
                      <Descriptions.Item label="File">
                        <span className="font-mono text-xs">{majCatGridMeta.fileName || '—'}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Major Categories">
                        <Badge variant="info">{(majCatGridMeta.categoriesCount ?? 0).toLocaleString()}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Attribute Slots">
                        <Badge variant="secondary">{(majCatGridMeta.attributesCount ?? 0).toLocaleString()}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Data Rows Parsed">
                        <Badge variant="success">{(majCatGridMeta.totalRows ?? majCatGridMeta.totalValues ?? 0).toLocaleString()}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Rows Skipped">
                        <Badge variant={(majCatGridMeta.skippedRows ?? 0) > 0 ? 'warning' : 'secondary'}>
                          {(majCatGridMeta.skippedRows ?? 0).toLocaleString()}
                        </Badge>
                      </Descriptions.Item>
                    </Descriptions>
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      message="No grid uploaded yet"
                      description="Upload ALL_300_GRIDS_SEQUENCED.xlsx to enable major-category-scoped dropdown filtering in the Approver page."
                    />
                  )}
                </div>

                {/* Upload panel */}
                <div className="md:col-span-5">
                  <div className="rounded-md border border-border p-4">
                    <div className="mb-1 font-semibold">Upload Grid Excel</div>
                    <div className="mb-3 text-xs text-muted-foreground">
                      Upload <strong>ALL_300_GRIDS_SEQUENCED.xlsx</strong> — columns A (Major Category), E (Attribute), G (Allowed Value). Parsing ~318k rows may take 30–60 seconds.
                    </div>

                    <input
                      ref={majCatFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMajCatGridUpload(file);
                      }}
                    />

                    {majCatGridUploading ? (
                      <div>
                        <div className="mb-2 text-[13px] text-[#FF6F61]">
                          <RefreshCw className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin" />
                          Parsing Excel... this may take up to a minute
                        </div>
                        <Progress value={majCatGridProgress} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => majCatFileRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30 px-4 py-6 transition-colors hover:border-[#FF6F61] hover:bg-[#FF6F61]/5"
                      >
                        <Inbox className="mb-2 h-8 w-8 text-[#FF6F61]" />
                        <p className="text-[13px]">
                          Click to upload <strong>.xlsx</strong> file
                        </p>
                        <p className="text-[11px] text-muted-foreground">Only Excel files. Max 50 MB.</p>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Spinner>
          </CardContent>
        </Card>

        {/* Mandatory Grid Upload (field visibility per major category, ported from 993f2cb) */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TableIcon className="h-4 w-4" />
              Mandatory Grid (Field Visibility per Major Category)
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={downloadMandatoryTemplate}>
                <Download />
                Download Template
              </Button>
              <Button size="sm" variant="outline" onClick={loadMandatoryGridStatus} disabled={mandatoryGridStatusLoading}>
                <RotateCw className={mandatoryGridStatusLoading ? 'animate-spin' : ''} />
                Refresh Status
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Spinner spinning={mandatoryGridStatusLoading}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* Status panel */}
                <div className="md:col-span-7">
                  {mandatoryGridMeta ? (
                    <Descriptions bordered>
                      <Descriptions.Item label="Last Upload">
                        {mandatoryGridMeta.uploadedAt
                          ? new Date(mandatoryGridMeta.uploadedAt).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }) + ' IST'
                          : <span className="text-muted-foreground">Unknown</span>}
                      </Descriptions.Item>
                      <Descriptions.Item label="File">
                        <span className="font-mono text-xs">{mandatoryGridMeta.fileName || '—'}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Excel Rows (Major Cat.)">
                        <Badge variant="info">{(mandatoryGridMeta.categoriesCount ?? mandatoryGridMeta.totalRows ?? 0).toLocaleString()}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="SAP Key Columns">
                        <Badge variant="secondary">{(mandatoryGridMeta.attributesCount ?? 0).toLocaleString()}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Visible Fields (1s in Excel)">
                        <Badge variant="success" title="Count of (major_category × SAP_key) cells marked 1 = visible in article card">
                          {(mandatoryGridMeta.activeMappings ?? mandatoryGridMeta.totalValues ?? 0).toLocaleString()}
                        </Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Rows Skipped">
                        <Badge variant={(mandatoryGridMeta.skippedRows ?? 0) > 0 ? 'warning' : 'secondary'}>
                          {(mandatoryGridMeta.skippedRows ?? 0).toLocaleString()}
                        </Badge>
                      </Descriptions.Item>
                    </Descriptions>
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      message="No mandatory grid uploaded yet"
                      description="Upload MANDATORY GRID DATA.xlsx — Row 3: SAP keys, Row 4: labels, Row 6+: data rows (1 = visible, 0/empty = hidden)."
                    />
                  )}
                </div>

                {/* Upload panel */}
                <div className="md:col-span-5">
                  <div className="rounded-md border border-border p-4">
                    <div className="mb-1 font-semibold">Upload Mandatory Grid Excel</div>
                    <div className="mb-3 text-xs text-muted-foreground">
                      Upload <strong>MANDATORY GRID DATA.xlsx</strong> — Row 3 has SAP keys, Row 4 has labels, Row 5 is empty, Row 6+ are data rows (1 = active/visible, 0 or empty = hidden).
                    </div>

                    <input
                      ref={mandatoryFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMandatoryGridUpload(file);
                      }}
                    />

                    {mandatoryGridUploading ? (
                      <div>
                        <div className="mb-2 text-[13px] text-[#FF6F61]">
                          <RefreshCw className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin" />
                          Parsing Excel... please wait
                        </div>
                        <Progress value={mandatoryGridProgress} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => mandatoryFileRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30 px-4 py-6 transition-colors hover:border-[#FF6F61] hover:bg-[#FF6F61]/5"
                      >
                        <Inbox className="mb-2 h-8 w-8 text-[#FF6F61]" />
                        <p className="text-[13px]">
                          Click to upload <strong>.xlsx</strong> file
                        </p>
                        <p className="text-[11px] text-muted-foreground">Only Excel files. Max 50 MB.</p>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Spinner>
          </CardContent>
        </Card>

        {/* Hierarchy Excel Upload (Division / Sub-Division / Major Category, two-step preview→confirm) */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TableIcon className="h-4 w-4" />
              Hierarchy Excel Upload (Division / Sub-Division / Major Category)
            </CardTitle>
            <Button size="sm" variant="outline" onClick={loadHierarchyExcelStatus} disabled={hierarchyExcelStatusLoading}>
              <RotateCw className={hierarchyExcelStatusLoading ? 'animate-spin' : ''} />
              Refresh Status
            </Button>
          </CardHeader>
          <CardContent>
            <Spinner spinning={hierarchyExcelStatusLoading}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* Status panel */}
                <div className="md:col-span-7">
                  {hierarchyExcelStatus ? (
                    <Descriptions bordered>
                      <Descriptions.Item label="Divisions (Departments)">
                        <Badge variant="info">{hierarchyExcelStatus.departments}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Sub-Divisions">
                        <Badge variant="secondary">{hierarchyExcelStatus.subDepartments}</Badge>
                      </Descriptions.Item>
                      <Descriptions.Item label="Major Categories">
                        <Badge variant="success">{hierarchyExcelStatus.categories}</Badge>
                      </Descriptions.Item>
                    </Descriptions>
                  ) : (
                    <Alert
                      type="info"
                      showIcon
                      message="Upload Mandatory Grid Excel to sync hierarchy"
                      description="Reads DIV, SUB-DIV, MAJOR_CATEGORY columns and upserts into departments, sub_departments, categories tables. Safe to re-upload — existing records are updated, nothing is deleted."
                    />
                  )}

                  {hierarchyResult && (
                    <Alert
                      type="success"
                      showIcon
                      className="mt-3"
                      message="Import Complete"
                      description={
                        <div className="mt-1 flex flex-wrap gap-4">
                          <div>
                            <strong>Departments:</strong>{' '}
                            <Badge variant="success">+{hierarchyResult.departments.new} new</Badge>{' '}
                            <Badge variant="info">~{hierarchyResult.departments.updated} updated</Badge>
                          </div>
                          <div>
                            <strong>Sub-Divisions:</strong>{' '}
                            <Badge variant="success">+{hierarchyResult.subDepartments.new} new</Badge>{' '}
                            <Badge variant="info">~{hierarchyResult.subDepartments.updated} updated</Badge>
                          </div>
                          <div>
                            <strong>Major Categories:</strong>{' '}
                            <Badge variant="success">+{hierarchyResult.categories.new} new</Badge>{' '}
                            <Badge variant="info">~{hierarchyResult.categories.updated} updated</Badge>
                          </div>
                          {hierarchyResult.skippedRows > 0 && (
                            <Badge variant="warning">{hierarchyResult.skippedRows} rows skipped (empty cells)</Badge>
                          )}
                        </div>
                      }
                    />
                  )}
                </div>

                {/* Upload panel */}
                <div className="md:col-span-5">
                  <div className="rounded-md border border-border p-4">
                    <div className="mb-1 font-semibold">Upload Hierarchy Excel</div>
                    <div className="mb-3 text-xs text-muted-foreground">
                      Upload <strong>MANDATORY GRID DATA.xlsx</strong> — columns A (DIV), B (SUB-DIV), C (MAJOR_CATEGORY). Data starts from row 6. Sub-division codes are auto-normalized (e.g. <code>KGU</code> → <code>KG-U</code>).
                    </div>

                    <input
                      ref={hierarchyFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleHierarchyPreview(file);
                      }}
                    />

                    {hierarchyExcelUploading ? (
                      <div>
                        <div className="mb-2 text-[13px] text-[#FF6F61]">
                          <RefreshCw className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin" />
                          {hierarchyPreview ? 'Importing to database...' : 'Reading Excel file...'}
                        </div>
                        <Progress value={hierarchyExcelProgress} />
                      </div>
                    ) : hierarchyPreview ? (
                      <div>
                        <Alert
                          type="info"
                          showIcon
                          className="mb-3"
                          message="Preview — confirm to import"
                          description={
                            <div className="mt-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span>
                                  <strong>Divisions:</strong> <Badge variant="info">{hierarchyPreview.departments.total}</Badge>
                                </span>
                                <span>
                                  <strong>Sub-Divisions:</strong> <Badge variant="secondary">{hierarchyPreview.subDepartments.total}</Badge>
                                </span>
                                <span>
                                  <strong>Major Categories:</strong> <Badge variant="success">{hierarchyPreview.categories.total}</Badge>
                                </span>
                                {hierarchyPreview.skippedRows > 0 && (
                                  <Badge variant="warning">{hierarchyPreview.skippedRows} rows skipped</Badge>
                                )}
                              </div>
                              {hierarchyPreview.preview && (
                                <div className="text-xs text-muted-foreground">
                                  <div>
                                    <strong>Divisions found:</strong> {hierarchyPreview.preview.divisions.join(', ')}
                                  </div>
                                  <div className="mt-1">
                                    <strong>Sub-Divisions:</strong> {hierarchyPreview.preview.subDivisions.join(', ')}
                                  </div>
                                </div>
                              )}
                            </div>
                          }
                        />
                        <div className="flex gap-2">
                          <Button onClick={handleHierarchyConfirm} className="flex-1">
                            <CheckCircle2 />
                            Confirm Import
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setHierarchyPreview(null);
                              setHierarchyPendingFile(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => hierarchyFileRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30 px-4 py-6 transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
                      >
                        <Inbox className="mb-2 h-8 w-8 text-emerald-600" />
                        <p className="text-[13px]">
                          Click to upload <strong>.xlsx</strong> file
                        </p>
                        <p className="text-[11px] text-muted-foreground">Previews before importing. Only Excel files. Max 50 MB.</p>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Spinner>
          </CardContent>
        </Card>

        {/* Debug Info */}
        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardContent className="pt-6">
            <p><strong>Debug Info:</strong></p>
            <p>Expense Data Loaded: {expenseData ? 'Yes' : 'No'}</p>
            <p>Image Data Loaded: {imageData ? 'Yes' : 'No'}</p>
            <p>Status Breakdown Records: {statusBreakdownData.length}</p>
            <p>Category Breakdown Records: {categoryBreakdownData.length}</p>
          </CardContent>
        </Card>

        {/* Expense and Image Analytics Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="glass card-3d rounded-2xl border border-white/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Expense Overview</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {expenseData ? (
                <Statistic
                  title="Total Cost Price"
                  value={expenseData.totalCostPrice}
                  prefix="$"
                  valueStyle={{ color: '#FF6F61' }}
                />
              ) : (
                <Empty description="No expense data available" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Image Usage Overview</CardTitle>
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {imageData ? (
                <div className="grid grid-cols-2 gap-4">
                  <Statistic title="Total Images Used" value={imageData.totalImages} valueStyle={{ color: '#FF6F61' }} />
                  <Statistic title="Unique Images" value={imageData.uniqueImages} valueStyle={{ color: '#FFA62B' }} />
                  <Statistic
                    title="Images with Costs"
                    value={expenseData?.totalJobsWithCosts || 0}
                    valueStyle={{ color: '#1f2937' }}
                  />
                  <Statistic
                    title="Avg Images/Day"
                    value={imageData.averageImagesPerDay}
                    valueStyle={{ color: '#10b981' }}
                  />
                </div>
              ) : (
                <Empty description="No image data available" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tables */}
        <Card className="mb-6 mt-6 glass rounded-2xl border border-white/60">
          <CardHeader>
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statusBreakdownData.length > 0 ? (
              <DataTable
                columns={expenseColumns}
                dataSource={statusBreakdownData}
                pagination={false}
                size="small"
                rowKey="key"
              />
            ) : (
              <Empty description="No expense data available" className="py-10" />
            )}
          </CardContent>
        </Card>

        <Card className="mb-6 glass rounded-2xl border border-white/60">
          <CardHeader>
            <CardTitle className="text-base">Detailed Image Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {detailedExpenses.length > 0 ? (
              <DataTable
                columns={detailedExpenseColumns}
                dataSource={detailedExpenses}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                size="small"
                rowKey="key"
                scroll={{ x: 800 }}
              />
            ) : (
              <Empty description="No detailed expense data available" className="py-10" />
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 glass rounded-2xl border border-white/60">
          <CardHeader>
            <CardTitle className="text-base">Admin Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Use the sidebar navigation to manage the system:</p>
            <ul className="ml-4 list-disc">
              <li><strong>Hierarchy Management:</strong> Manage departments, categories, and attributes</li>
              <li><strong>Expense Analytics:</strong> Track costs, selling prices, and profit margins</li>
              <li><strong>Image Usage Analytics:</strong> Monitor total images and extraction statistics</li>
            </ul>
            {/* keep Tag/Info imports referenced */}
            {false && <Tag><Info /></Tag>}
          </CardContent>
        </Card>
      </Spinner>
    </div>
  );
}
