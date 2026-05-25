/**
 * SRM Failed Extractions Page (Admin Only)
 *
 * Shows all SRM records still at SRM_IMPORT status (VLM enrichment never completed).
 * Supports per-record retry and bulk retry-all.
 * Route: /admin/srm-failed
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Statistic,
  Row,
  Col,
  message,
  Tooltip,
  Image,
  Popconfirm,
  Badge,
  Alert,
  Typography,
  Spin,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  PictureOutlined,
  FilterOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { APP_CONFIG } from '../../../constants/app/config';

const { Search } = Input;
const { Option } = Select;
const { Title, Text } = Typography;

interface FailedRecord {
  id: string;
  pptNumber: string | null;
  designNumber: string | null;
  majorCategory: string | null;
  division: string | null;
  subDivision: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  imageUrl: string | null;
  extractionStatus: string;
  /** PENDING | APPROVED | REJECTED */
  approvalStatus: string;
  /** NOT_SYNCED | PENDING | SYNCED | FAILED */
  sapSyncStatus: string;
  createdAt: string;
  updatedAt: string;
  aiModel: string | null;
  avgConfidence: number | null;
}

/**
 * Returns true when retry should be BLOCKED.
 * Rule: if the article is APPROVED by an approver AND already SYNCED to SAP,
 * the data was manually reviewed — VLM extraction would overwrite approved work.
 */
function isRetryBlocked(rec: FailedRecord): boolean {
  return rec.approvalStatus === 'APPROVED' && rec.sapSyncStatus === 'SYNCED';
}

interface DivisionBreakdown {
  division: string;
  count: number;
}

interface FetchResult {
  records: FailedRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  divisionBreakdown: DivisionBreakdown[];
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function SrmFailedExtractionsPage() {
  const [loading, setLoading]               = useState(false);
  const [records, setRecords]               = useState<FailedRecord[]>([]);
  const [total, setTotal]                   = useState(0);
  const [divBreakdown, setDivBreakdown]     = useState<DivisionBreakdown[]>([]);

  // Filters & pagination
  const [search, setSearch]                 = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('');
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState(50);

  // Per-row retry state: recordId → 'loading' | 'done' | 'failed'
  const [rowRetrying, setRowRetrying]       = useState<Record<string, 'loading' | 'done' | 'failed'>>({});

  // Retry-all state
  const [retryAllLoading, setRetryAllLoading] = useState(false);
  const [retryAllResult, setRetryAllResult]   = useState<string | null>(null);

  const loadData = useCallback(async (opts?: { page?: number; search?: string; division?: string; pageSize?: number }) => {
    setLoading(true);
    try {
      const p   = opts?.page     ?? page;
      const q   = opts?.search   ?? search;
      const div = opts?.division ?? divisionFilter;
      const lim = opts?.pageSize ?? pageSize;

      const params = new URLSearchParams({
        page:  String(p),
        limit: String(lim),
      });
      if (q)   params.set('search',   q);
      if (div) params.set('division', div);

      const res  = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/failed-extractions?${params}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load data');

      const data: FetchResult = json.data;
      setRecords(data.records);
      setTotal(data.total);
      setDivBreakdown(data.divisionBreakdown || []);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load failed extractions');
    } finally {
      setLoading(false);
    }
  }, [page, search, divisionFilter, pageSize]);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    loadData({ search: value, page: 1 });
  };

  const handleDivisionChange = (value: string) => {
    setDivisionFilter(value);
    setPage(1);
    loadData({ division: value, page: 1 });
  };

  const handleTableChange = (pagination: TablePaginationConfig) => {
    const newPage     = pagination.current  || 1;
    const newPageSize = pagination.pageSize || pageSize;
    setPage(newPage);
    setPageSize(newPageSize);
    loadData({ page: newPage, pageSize: newPageSize });
  };

  const handleRetryRow = async (record: FailedRecord) => {
    setRowRetrying(prev => ({ ...prev, [record.id]: 'loading' }));
    try {
      const res  = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/failed-extractions/${record.id}/retry`, {
        method:  'POST',
        headers: getAuthHeaders(),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Retry failed');
      }

      setRowRetrying(prev => ({ ...prev, [record.id]: 'done' }));
      message.success(`✅ ${record.designNumber || record.id} — enrichment succeeded`);

      // Refresh row by reloading the table
      setTimeout(() => loadData(), 500);
    } catch (err: any) {
      setRowRetrying(prev => ({ ...prev, [record.id]: 'failed' }));
      message.error(`❌ ${record.designNumber || record.id}: ${err?.message || 'Retry failed'}`);
    }
  };

  const handleRetryAll = async () => {
    setRetryAllLoading(true);
    setRetryAllResult(null);
    try {
      const body: any = {};
      if (divisionFilter) body.division = divisionFilter;

      const res  = await fetch(`${APP_CONFIG.api.baseURL}/admin/srm/failed-extractions/retry-all`, {
        method:  'POST',
        headers: getAuthHeaders(),
        body:    JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Retry-all failed');

      setRetryAllResult(json.message);
      message.info(json.message);
    } catch (err: any) {
      message.error(err?.message || 'Retry-all failed');
    } finally {
      setRetryAllLoading(false);
    }
  };

  // Collect all unique divisions from the breakdown for the filter dropdown
  const divisionOptions = divBreakdown.map(d => d.division).filter(Boolean).sort();

  const columns: ColumnsType<FailedRecord> = [
    {
      title:     'Image',
      dataIndex: 'imageUrl',
      key:       'imageUrl',
      width:     80,
      render:    (url: string | null) =>
        url ? (
          <Image
            src={url}
            width={56}
            height={56}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            preview={{ mask: <EyeIcon /> }}
          />
        ) : (
          <div style={{ width: 56, height: 56, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PictureOutlined style={{ color: '#bbb', fontSize: 20 }} />
          </div>
        ),
    },
    {
      title:     'Presentation No',
      dataIndex: 'pptNumber',
      key:       'pptNumber',
      width:     160,
      render:    (v: string | null) => <Text strong>{v || '—'}</Text>,
    },
    {
      title:     'Design No',
      dataIndex: 'designNumber',
      key:       'designNumber',
      width:     140,
      render:    (v: string | null) => v || '—',
    },
    {
      title:     'Major Category',
      dataIndex: 'majorCategory',
      key:       'majorCategory',
      width:     140,
      render:    (v: string | null) => v ? <Tag color="blue">{v}</Tag> : '—',
    },
    {
      title:     'Division',
      dataIndex: 'division',
      key:       'division',
      width:     110,
      render:    (v: string | null) => v || '—',
    },
    {
      title:     'Vendor',
      key:       'vendor',
      width:     170,
      render:    (_: any, rec: FailedRecord) => (
        <span>
          {rec.vendorName || '—'}
          {rec.vendorCode && (
            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
              {rec.vendorCode}
            </Text>
          )}
        </span>
      ),
    },
    {
      title:     'Status',
      dataIndex: 'extractionStatus',
      key:       'extractionStatus',
      width:     120,
      render:    (v: string) => (
        <Tag color={v === 'SRM_IMPORT' ? 'orange' : v === 'COMPLETED' ? 'green' : 'red'} icon={v === 'SRM_IMPORT' ? <WarningOutlined /> : <CheckCircleOutlined />}>
          {v}
        </Tag>
      ),
    },
    {
      title:     'Created',
      dataIndex: 'createdAt',
      key:       'createdAt',
      width:     130,
      render:    (v: string) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    },
    {
      title:  'Approval',
      key:    'approvalStatus',
      width:  110,
      render: (_: any, rec: FailedRecord) => {
        const colorMap: Record<string, string> = { APPROVED: 'green', REJECTED: 'red', PENDING: 'orange' };
        return <Tag color={colorMap[rec.approvalStatus] || 'default'}>{rec.approvalStatus}</Tag>;
      },
    },
    {
      title:  'SAP Sync',
      key:    'sapSyncStatus',
      width:  100,
      render: (_: any, rec: FailedRecord) => {
        const colorMap: Record<string, string> = { SYNCED: 'green', FAILED: 'red', PENDING: 'blue', NOT_SYNCED: 'default' };
        return <Tag color={colorMap[rec.sapSyncStatus] || 'default'}>{rec.sapSyncStatus.replace('_', ' ')}</Tag>;
      },
    },
    {
      title:  'Action',
      key:    'action',
      width:  130,
      fixed:  'right',
      render: (_: any, rec: FailedRecord) => {
        const state   = rowRetrying[rec.id];
        const blocked = isRetryBlocked(rec);

        if (state === 'done') {
          return <Tag color="success" icon={<CheckCircleOutlined />}>Done</Tag>;
        }

        if (blocked) {
          return (
            <Tooltip title="Approved & SAP-synced — extraction locked to protect manually approved data">
              <Tag color="default" style={{ cursor: 'not-allowed', userSelect: 'none' }}>
                🔒 Locked
              </Tag>
            </Tooltip>
          );
        }

        return (
          <Tooltip title={!rec.imageUrl ? 'No image URL — cannot retry' : 'Re-run VLM extraction (~30s)'}>
            <Button
              size="small"
              type="primary"
              icon={<ReloadOutlined spin={state === 'loading'} />}
              loading={state === 'loading'}
              disabled={!rec.imageUrl || state === 'loading'}
              onClick={() => handleRetryRow(rec)}
            >
              Retry
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <ExclamationCircleOutlined style={{ color: '#fa8c16', marginRight: 8 }} />
          SRM Failed Extractions
        </Title>
        <Text type="secondary">
          SRM records inserted into the database but VLM enrichment never completed (status = SRM_IMPORT).
          Use the Retry buttons to re-run extraction.
        </Text>
      </div>

      {/* Stats row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="Total Pending Enrichment"
              value={total}
              valueStyle={{ color: total > 0 ? '#fa8c16' : '#52c41a' }}
              prefix={<WarningOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        {divBreakdown.slice(0, 3).map(d => (
          <Col xs={24} sm={6} key={d.division}>
            <Card size="small">
              <Statistic
                title={d.division || 'Unknown Division'}
                value={d.count}
                valueStyle={{ color: '#fa8c16' }}
                loading={loading}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Retry-all result banner */}
      {retryAllResult && (
        <Alert
          type="info"
          message={retryAllResult}
          description="Processing continues in the background. Refresh the table in a few minutes to see updated statuses."
          showIcon
          closable
          onClose={() => setRetryAllResult(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Controls */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row gutter={12} align="middle">
          <Col flex="1">
            <Search
              placeholder="Search by presentation no or design no..."
              allowClear
              enterButton={<SearchOutlined />}
              onSearch={handleSearch}
              style={{ maxWidth: 360 }}
            />
          </Col>
          <Col>
            <Select
              placeholder="All Divisions"
              allowClear
              style={{ width: 160 }}
              value={divisionFilter || undefined}
              onChange={handleDivisionChange}
              suffixIcon={<FilterOutlined />}
            >
              {divisionOptions.map(d => (
                <Option key={d} value={d}>{d}</Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData()}
              loading={loading}
            >
              Refresh
            </Button>
          </Col>
          <Col>
            <Popconfirm
              title={`Retry all ${divisionFilter ? `"${divisionFilter}"` : ''} failed records?`}
              description={`This will re-run VLM extraction for ${total} record(s) in the background. It may take several minutes.`}
              onConfirm={handleRetryAll}
              okText="Yes, Retry All"
              cancelText="Cancel"
              okButtonProps={{ loading: retryAllLoading }}
              disabled={total === 0}
            >
              <Button
                type="primary"
                danger
                icon={<SyncOutlined spin={retryAllLoading} />}
                loading={retryAllLoading}
                disabled={total === 0}
              >
                Retry All ({total})
              </Button>
            </Popconfirm>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card size="small" bodyStyle={{ padding: 0 }}>
        <Table<FailedRecord>
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          size="small"
          pagination={{
            current:    page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal:  (t, [from, to]) => `${from}–${to} of ${t} records`,
          }}
          onChange={handleTableChange}
          rowClassName={(rec) => rowRetrying[rec.id] === 'done' ? 'row-success' : ''}
          locale={{
            emptyText: loading
              ? <Spin size="small" />
              : (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <CheckCircleOutlined style={{ fontSize: 40, color: '#52c41a', marginBottom: 8 }} />
                  <div style={{ color: '#52c41a', fontWeight: 600 }}>All clear! No pending extractions.</div>
                  <div style={{ color: '#888', fontSize: 12 }}>All SRM records have been successfully enriched.</div>
                </div>
              ),
          }}
        />
      </Card>

      <style>{`
        .row-success td { background: #f6ffed !important; transition: background 0.4s; }
      `}</style>
    </div>
  );
}

// Inline eye icon to avoid extra import
function EyeIcon() {
  return <span style={{ fontSize: 12, color: '#fff' }}>View</span>;
}
