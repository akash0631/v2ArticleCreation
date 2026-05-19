import { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Statistic, Button, message, Table, Empty, Spin, Popconfirm, Tag, Descriptions, Alert } from 'antd';
import {
  UserOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  DollarOutlined,
  PictureOutlined,
  EyeOutlined,
  FileTextOutlined,
  SyncOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
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
      // Refresh status after sync
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
      console.log('Admin Stats:', adminStats);
      console.log('Expense Data:', expenses);
      console.log('Image Data:', images);
      console.log('Detailed Expenses:', detailed);
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
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
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

  const expenseColumns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Count',
      dataIndex: 'count',
      key: 'count',
    },
    {
      title: 'Total Cost',
      key: 'costPrice',
      render: (_: any, record: any) => `$${record.totalCostPrice?.toFixed(2) || '0.00'}`,
    },
  ];

  const detailedExpenseColumns = [
    {
      title: 'Image',
      key: 'image',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: any) => (
        record.imageUrl ? (
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => window.open(record.imageUrl, '_blank')}
            title="View image"
          />
        ) : (
          <span style={{ color: '#ccc' }}>—</span>
        )
      ),
    },
    {
      title: 'Article',
      dataIndex: 'imageName',
      key: 'imageName',
      ellipsis: true,
      render: (imageName: string, record: any) => {
        // Use articleNumber if available, otherwise fall back to imageName
        const displayName = record.articleNumber || imageName;
        return displayName || '—';
      },
    },
    {
      title: 'Input Tokens',
      dataIndex: 'inputTokens',
      key: 'inputTokens',
      align: 'right' as const,
      render: (val: number) => val?.toLocaleString() || '0',
    },
    {
      title: 'Output Tokens',
      dataIndex: 'outputTokens',
      key: 'outputTokens',
      align: 'right' as const,
      render: (val: number) => val?.toLocaleString() || '0',
    },
    {
      title: 'Total Tokens',
      key: 'totalTokens',
      align: 'right' as const,
      render: (_: any, record: any) => ((record.inputTokens || 0) + (record.outputTokens || 0)).toLocaleString(),
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      align: 'right' as const,
      render: (val: number) => `$${val?.toFixed(4) || '0.0000'}`,
    },
  ];

  const categoryColumns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Image Count',
      dataIndex: 'count',
      key: 'count',
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
    ? Object.entries(imageData.categoryBreakdown).map(([category, count]: [string, any]) => ({
      key: category,
      category,
      count,
    }))
    : [];

  return (
    <div className="page-scroll-enabled" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>Admin Dashboard</h1>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          Refresh
        </Button>
      </div>

      <Spin spinning={loading}>
        {/* Main Statistics Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Uploads"
                value={stats.totalUploads}
                prefix={<CloudUploadOutlined />}
                valueStyle={{ color: '#FF6F61' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Completed"
                value={stats.completed}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Failed"
                value={stats.failed}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: '#f5222d' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Pending"
                value={stats.pending}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Backfill Tools */}
        <Card
          title={<span><FileTextOutlined style={{ marginRight: 8 }} />Data Maintenance</span>}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]} align="middle">
            <Col flex="auto">
              <div>
                <strong>Backfill Article Descriptions</strong>
                <div style={{ color: '#8c8c8c', fontSize: 13, marginTop: 2 }}>
                  Re-compute article descriptions for all articles created from <strong>10 Apr 2026</strong> to today using the current formula (YARN‑WEAVE‑MVGR‑LYCRA‑NECK‑SLEEVE…, max 40 chars).
                </div>
              </div>
            </Col>
            <Col>
              <Popconfirm
                title="Run description backfill?"
                description="This will overwrite existing article descriptions for articles from 10 Apr 2026 to today. Continue?"
                onConfirm={runDescriptionBackfill}
                okText="Yes, run it"
                cancelText="Cancel"
              >
                <Button
                  type="primary"
                  icon={<FileTextOutlined />}
                  loading={backfillLoading}
                >
                  Run Backfill
                </Button>
              </Popconfirm>
            </Col>
          </Row>
        </Card>

        {/* SRM Sync */}
        <Card
          title={<span><SyncOutlined style={{ marginRight: 8 }} />SRM Presentation Sync</span>}
          style={{ marginBottom: 24 }}
          extra={
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={loadSrmStatus}
              loading={srmStatusLoading}
            >
              Refresh Status
            </Button>
          }
        >
          <Spin spinning={srmStatusLoading}>
            {srmStatus ? (
              <>
                <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Records in DB">
                    <strong style={{ fontSize: 18 }}>{srmStatus.totalInDb}</strong>
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Sync">
                    {srmStatus.lastSyncAt
                      ? new Date(srmStatus.lastSyncAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
                      : <span style={{ color: '#999' }}>Never</span>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Schedule">
                    {srmStatus.schedule}
                  </Descriptions.Item>
                  <Descriptions.Item label="Division Breakdown" span={2}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {srmStatus.divisionBreakdown.map(d => (
                        <Tag key={d.division} color="blue">{d.division}: {d.count}</Tag>
                      ))}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Approval Status">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {srmStatus.statusBreakdown.map(s => (
                        <Tag
                          key={s.status}
                          color={s.status === 'APPROVED' ? 'green' : s.status === 'REJECTED' ? 'red' : 'orange'}
                        >
                          {s.status}: {s.count}
                        </Tag>
                      ))}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Pending VLM Extraction" span={2}>
                    {srmStatus.pendingEnrichment > 0 ? (
                      <Tag color="volcano">{srmStatus.pendingEnrichment} records need extraction</Tag>
                    ) : (
                      <Tag color="green">All records extracted</Tag>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Hidden from Approvers">
                    {srmStatus.hiddenFromApprovers > 0 ? (
                      <Tag color="gold">{srmStatus.hiddenFromApprovers} extracting now</Tag>
                    ) : (
                      <Tag color="green">None</Tag>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Next Syncs" span={3}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {srmStatus.nextScheduledSyncs.map(s => (
                        <span key={s.istTime}>
                          <Tag color="geekblue">{s.istTime} IST</Tag>
                          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
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
                    icon={<CheckCircleOutlined />}
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Last Sync Result"
                    description={
                      <span>
                        <strong>{srmLastResult.inserted}</strong> new records inserted&nbsp;&nbsp;·&nbsp;&nbsp;
                        <strong>{srmLastResult.skipped}</strong> already existed (skipped)&nbsp;&nbsp;·&nbsp;&nbsp;
                        <strong>{srmLastResult.errors}</strong> errors&nbsp;&nbsp;·&nbsp;&nbsp;
                        <strong>{srmLastResult.total}</strong> total from SRM API
                      </span>
                    }
                  />
                )}

                {srmEnrichMessage && (
                  <Alert
                    type="info"
                    icon={<InfoCircleOutlined />}
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="VLM Extraction Started"
                    description={srmEnrichMessage}
                  />
                )}

                <Row gutter={[12, 12]}>
                  <Col xs={24} sm={12}>
                    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Sync Presentations</div>
                      <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
                        Fetches all presentations from the SRM API and inserts any new records. Already-imported records are skipped.
                      </div>
                      <Popconfirm
                        title="Trigger SRM Sync?"
                        description="Fetch all presentations from the SRM API and insert new ones. VLM extraction will run after sync."
                        onConfirm={runSrmSync}
                        okText="Yes, sync now"
                        cancelText="Cancel"
                      >
                        <Button
                          type="primary"
                          icon={<SyncOutlined spin={srmSyncing} />}
                          loading={srmSyncing}
                          block
                        >
                          {srmSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                      </Popconfirm>
                    </div>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Run VLM Extraction
                        {srmStatus.pendingEnrichment > 0 && (
                          <Tag color="volcano" style={{ marginLeft: 8 }}>{srmStatus.pendingEnrichment} pending</Tag>
                        )}
                      </div>
                      <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
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
                          icon={<SyncOutlined spin={srmEnriching} />}
                          loading={srmEnriching}
                          disabled={srmStatus.pendingEnrichment === 0}
                          block
                        >
                          {srmEnriching ? 'Starting...' : srmStatus.pendingEnrichment === 0 ? 'All Extracted' : 'Extract Attributes'}
                        </Button>
                      </Popconfirm>
                    </div>
                  </Col>
                </Row>
              </>
            ) : (
              <Empty description="Could not load SRM sync status" />
            )}
          </Spin>
        </Card>

        {/* Vendor Master Sync */}
        <Card
          title={<span><SyncOutlined style={{ marginRight: 8 }} />Vendor Master Sync</span>}
          style={{ marginBottom: 24 }}
          extra={
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={loadVendorStatus}
              loading={vendorStatusLoading}
            >
              Refresh Status
            </Button>
          }
        >
          <Spin spinning={vendorStatusLoading}>
            {vendorStatus ? (
              <>
                <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Records in DB">
                    <strong style={{ fontSize: 18 }}>{vendorStatus.count.toLocaleString()}</strong>
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Sync">
                    {vendorStatus.lastSyncedAt
                      ? new Date(vendorStatus.lastSyncedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
                      : <span style={{ color: '#999' }}>Never</span>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Schedule">
                    Daily at 2:00 AM IST
                  </Descriptions.Item>
                  <Descriptions.Item label="Source API" span={3}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#595959' }}>
                      https://my-dab-app.azurewebsites.net/api/ET_Supplier_Master
                    </span>
                  </Descriptions.Item>
                </Descriptions>

                <Row gutter={[12, 12]}>
                  <Col xs={24} sm={12}>
                    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Sync Vendor Master</div>
                      <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
                        Fetches all vendor records from the DAB API and upserts into the local database. Runs in background — page will auto-refresh status after 5s.
                      </div>
                      <Popconfirm
                        title="Trigger Vendor Master Sync?"
                        description="Fetch all vendors from the DAB API and upsert into master_vendor_details. This may take a minute."
                        onConfirm={runVendorSync}
                        okText="Yes, sync now"
                        cancelText="Cancel"
                      >
                        <Button
                          type="primary"
                          icon={<SyncOutlined spin={vendorSyncing} />}
                          loading={vendorSyncing}
                          block
                        >
                          {vendorSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                      </Popconfirm>
                    </div>
                  </Col>
                </Row>
              </>
            ) : (
              <Empty description="Could not load vendor master status" />
            )}
          </Spin>
        </Card>

        {/* Debug Info */}
        <Card style={{ marginBottom: 24, background: '#f0f2f5' }}>
          <p><strong>Debug Info:</strong></p>
          <p>Expense Data Loaded: {expenseData ? 'Yes' : 'No'}</p>
          <p>Image Data Loaded: {imageData ? 'Yes' : 'No'}</p>
          <p>Status Breakdown Records: {statusBreakdownData.length}</p>
          <p>Category Breakdown Records: {categoryBreakdownData.length}</p>
        </Card>

        {/* Expense and Image Analytics Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} md={12}>
            <Card title="Expense Overview" extra={<DollarOutlined />}>
              {expenseData ? (
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <Statistic
                      title="Total Cost Price"
                      value={expenseData.totalCostPrice}
                      prefix="$"
                      precision={2}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                </Row>
              ) : (
                <Empty description="No expense data available" />
              )}
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card title="Image Usage Overview" extra={<PictureOutlined />}>
              {imageData ? (
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <Statistic
                      title="Total Images Used"
                      value={imageData.totalImages}
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Statistic
                      title="Unique Images"
                      value={imageData.uniqueImages}
                      valueStyle={{ color: '#13c2c2' }}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Statistic
                      title="Images with Costs"
                      value={expenseData?.totalJobsWithCosts || 0}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Statistic
                      title="Avg Images/Day"
                      value={imageData.averageImagesPerDay}
                      precision={2}
                      valueStyle={{ color: '#eb2f96' }}
                    />
                  </Col>
                </Row>
              ) : (
                <Empty description="No image data available" />
              )}
            </Card>
          </Col>
        </Row>

        {/* Detailed Tables */}
        <Card style={{ marginBottom: 24, marginTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Expense Breakdown</h3>
          {statusBreakdownData.length > 0 ? (
            <Table
              columns={expenseColumns}
              dataSource={statusBreakdownData}
              pagination={false}
              size="small"
              rowKey="key"
            />
          ) : (
            <Empty description="No expense data available" style={{ padding: '40px 0' }} />
          )}
        </Card>

        {/* Detailed Per-Image Expenses */}
        <Card title="Detailed Image Expenses" style={{ marginBottom: 24 }}>
          {detailedExpenses.length > 0 ? (
            <Table
              columns={detailedExpenseColumns}
              dataSource={detailedExpenses}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `Total ${total} images` }}
              size="small"
              rowKey="key"
              scroll={{ x: 800 }}
            />
          ) : (
            <Empty description="No detailed expense data available" style={{ padding: '40px 0' }} />
          )}
        </Card>

        <Card title="Admin Overview" style={{ marginTop: 24 }}>
          <p>Use the sidebar navigation to manage the system:</p>
          <ul>
            <li><strong>Hierarchy Management:</strong> Manage departments, categories, and attributes</li>
            <li><strong>Expense Analytics:</strong> Track costs, selling prices, and profit margins</li>
            <li><strong>Image Usage Analytics:</strong> Monitor total images and extraction statistics</li>
          </ul>
        </Card>
      </Spin>
    </div>
  );
}
