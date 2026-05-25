import { useEffect, useState, useCallback } from 'react';
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
  Descriptions,
  Empty,
  Popconfirm,
  Spinner,
  Statistic,
  Tag,
  type DataTableColumn,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { BackendApiService } from '../../../services/api/backendApi';
import { APP_CONFIG } from '../../../constants/app/config';

const api = new BackendApiService();

interface SrmStatus {
  totalInDb: number;
  lastSyncAt: string | null;
  pendingEnrichment: number;
  hiddenFromApprovers: number;
  divisionBreakdown: { division: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  nextScheduledSyncs: { istTime: string; utc: string }[];
  schedule: string;
}

interface SrmSyncResult {
  inserted: number;
  skipped: number;
  errors: number;
  total: number;
}

interface VendorMasterStatus {
  count: number;
  lastSyncedAt: string | null;
}

export default function Admin() {
  const [stats, setStats] = useState({ totalUploads: 0, completed: 0, failed: 0, pending: 0 });
  const [expenseData, setExpenseData] = useState<any>(null);
  const [imageData, setImageData] = useState<any>(null);
  const [detailedExpenses, setDetailedExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [srmStatus, setSrmStatus] = useState<SrmStatus | null>(null);
  const [srmStatusLoading, setSrmStatusLoading] = useState(false);
  const [srmSyncing, setSrmSyncing] = useState(false);
  const [srmEnriching, setSrmEnriching] = useState(false);
  const [srmLastResult, setSrmLastResult] = useState<SrmSyncResult | null>(null);
  const [srmEnrichMessage, setSrmEnrichMessage] = useState<string | null>(null);

  const [vendorStatus, setVendorStatus] = useState<VendorMasterStatus | null>(null);
  const [vendorStatusLoading, setVendorStatusLoading] = useState(false);
  const [vendorSyncing, setVendorSyncing] = useState(false);

  const loadSrmStatus = useCallback(async () => {
    setSrmStatusLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load SRM status');
      setSrmStatus(data.data);
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
      setSrmLastResult({ inserted: data.inserted, skipped: data.skipped, errors: data.errors, total: data.total });
      message.success(`SRM sync complete — ${data.inserted} new, ${data.skipped} already exist`);
      await loadSrmStatus();
    } catch (err: any) {
      message.error(err?.message || 'SRM sync failed');
    } finally {
      setSrmSyncing(false);
    }
  };

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

  useEffect(() => {
    loadData();
    loadSrmStatus();
    loadVendorStatus();
  }, [loadSrmStatus, loadVendorStatus]);

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
    <div className="page-scroll-enabled p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold">Admin Dashboard</h1>
        <Button onClick={loadData} disabled={loading} variant="outline">
          <RotateCw className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <Spinner spinning={loading}>
        {/* Main Statistics Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <Statistic
                title="Total Uploads"
                value={stats.totalUploads}
                prefix={<CloudUpload className="h-5 w-5" />}
                valueStyle={{ color: '#FF6F61' }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Statistic
                title="Completed"
                value={stats.completed}
                prefix={<CheckCircle2 className="h-5 w-5" />}
                valueStyle={{ color: '#52c41a' }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Statistic
                title="Failed"
                value={stats.failed}
                prefix={<XCircle className="h-5 w-5" />}
                valueStyle={{ color: '#f5222d' }}
              />
            </CardContent>
          </Card>
          <Card>
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
        <Card className="mb-6">
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
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4" />
              SRM Presentation Sync
            </CardTitle>
            <Button size="sm" variant="outline" onClick={loadSrmStatus} disabled={srmStatusLoading}>
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

                  {srmLastResult && (
                    <Alert
                      type="success"
                      showIcon
                      className="mb-3"
                      message="Last Sync Result"
                      description={
                        <span>
                          <strong>{srmLastResult.inserted}</strong> new records inserted &nbsp;·&nbsp;
                          <strong>{srmLastResult.skipped}</strong> already existed &nbsp;·&nbsp;
                          <strong>{srmLastResult.errors}</strong> errors &nbsp;·&nbsp;
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
                    <div className="rounded-md border border-border p-4">
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

        {/* Vendor Master Sync */}
        <Card className="mb-6">
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
                    <div className="rounded-md border border-border p-4">
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

        {/* Debug Info */}
        <Card className="mb-6 bg-muted/40">
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
          <Card>
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
                  valueStyle={{ color: '#1890ff' }}
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
                  <Statistic title="Total Images Used" value={imageData.totalImages} valueStyle={{ color: '#722ed1' }} />
                  <Statistic title="Unique Images" value={imageData.uniqueImages} valueStyle={{ color: '#13c2c2' }} />
                  <Statistic
                    title="Images with Costs"
                    value={expenseData?.totalJobsWithCosts || 0}
                    valueStyle={{ color: '#1890ff' }}
                  />
                  <Statistic
                    title="Avg Images/Day"
                    value={imageData.averageImagesPerDay}
                    valueStyle={{ color: '#eb2f96' }}
                  />
                </div>
              ) : (
                <Empty description="No image data available" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tables */}
        <Card className="mb-6 mt-6">
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

        <Card className="mb-6">
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

        <Card className="mt-6">
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
