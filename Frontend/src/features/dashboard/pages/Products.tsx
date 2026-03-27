import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Space, Table, Tag, Typography, Empty, message, Modal, Image, Descriptions } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { APP_CONFIG } from '../../../constants/app/config';
import type { SchemaItem } from '../../../shared/types/extraction/ExtractionTypes';
import {
  ORDERED_EXPORT_HEADERS,
  HEADER_TO_SCHEMA_KEY,
  buildExportSchema,
  exportToExcel,
  mapMasterAttributes
} from '../../../shared/utils/export/extractionExport';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import './Products.css';

const { Title, Text } = Typography;

type ProductRow = {
  key: string;
  userId?: string | null;
  name: string;
  productType: string;
  vendor: string;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING' | 'PENDING';
  rawStatus?: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string | null;
  userEmail?: string | null;
  imageUrl?: string | null;
  results?: Array<{
    attribute?: { key?: string | null; label?: string | null } | null;
    rawValue?: string | number | null;
    finalValue?: string | number | null;
    confidence?: number | null;
  }>;
  flatData?: any; // Store original flat table data
};

export default function Products() {
  const user = localStorage.getItem('user');
  const userData = useMemo(() => {
    if (!user) return null;
    try {
      return JSON.parse(user);
    } catch {
      return null;
    }
  }, [user]);
  const isAdmin = userData?.role === 'ADMIN';
  const isCreator = userData?.role === 'CREATOR';
  const currentUserId = userData?.id ? String(userData.id) : null;
  const currentUserEmail = userData?.email ? String(userData.email).toLowerCase() : null;

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [detailsRow, setDetailsRow] = useState<ProductRow | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<ProductRow[]>([]);
  const [masterAttributes, setMasterAttributes] = useState<SchemaItem[]>([]);

  const normalizeStatus = useCallback((status?: string | null): ProductRow['status'] => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') return 'COMPLETED';
    if (normalized === 'error' || normalized === 'failed' || normalized === 'fail') return 'FAILED';
    if (normalized === 'processing' || normalized === 'extracting') return 'PROCESSING';
    return 'PENDING';
  }, []);

  const getMajorCategory = useCallback((results?: ProductRow['results']) => {
    if (!results || results.length === 0) return null;
    // Find the major_category attribute in the extraction results
    const match = results.find(item => {
      const key = item.attribute?.key?.toLowerCase();
      return key === 'major_category' || key === 'majorcategory';
    });
    const value = match?.finalValue ?? match?.rawValue ?? null;
    return value ? String(value) : null;
  }, []);

  const exportSchema = useMemo(() => buildExportSchema(masterAttributes, masterAttributes), [masterAttributes]);

  const buildDetailsRows = useCallback((row: ProductRow) => {
    // If we have results from the full extraction job, use those
    if (row.results && row.results.length > 0) {
      return row.results
        .filter((item) => {
          const raw = item.rawValue;
          const final = item.finalValue;
          const hasRaw = typeof raw === 'string' ? raw.trim() !== '' : raw !== null && raw !== undefined;
          const hasFinal = typeof final === 'string' ? final.trim() !== '' : final !== null && final !== undefined;
          return hasRaw || hasFinal;
        })
        .map((item) => ({
          attribute: item.attribute,
          rawValue: item.rawValue ?? '—',
          finalValue: item.finalValue ?? '—',
          confidence: item.confidence
        }));
    }


    // Otherwise, map flat table data to attribute format
    const flatData = row.flatData || row;
    const attributeMapping: Array<{ key: string; label: string; value: any }> = [
      // Use article_number (original filename) instead of imageName (UUID)
      { key: 'article_number', label: 'Article Number', value: flatData.articleNumber || flatData.imageName },
      { key: 'major_category', label: 'Major Category', value: flatData.majorCategory },
      { key: 'vendor_name', label: 'Vendor Name', value: flatData.vendorName },
      { key: 'design_number', label: 'Design Number', value: flatData.designNumber },
      { key: 'ppt_number', label: 'PPT Number', value: flatData.pptNumber },
      { key: 'rate', label: 'Rate', value: flatData.rate },
      { key: 'size', label: 'Size', value: flatData.size },
      { key: 'yarn_01', label: 'Yarn 1', value: flatData.yarn1 },
      { key: 'yarn_02', label: 'Yarn 2', value: flatData.yarn2 },
      { key: 'fabric_main_mvgr', label: 'Fabric Main MVGR', value: flatData.fabricMainMvgr },
      { key: 'weave', label: 'Weave', value: flatData.weave },
      { key: 'composition', label: 'Composition', value: flatData.composition },
      { key: 'finish', label: 'Finish', value: flatData.finish },
      { key: 'gsm', label: 'GSM', value: flatData.gsm },
      { key: 'shade', label: 'Shade', value: flatData.shade },
      { key: 'lycra_non_lycra', label: 'Lycra', value: flatData.lycra },
      { key: 'neck', label: 'Neck', value: flatData.neck },
      { key: 'neck_details', label: 'Neck Details', value: flatData.neckDetails },
      { key: 'collar', label: 'Collar', value: flatData.collar },
      { key: 'placket', label: 'Placket', value: flatData.placket },
      { key: 'sleeve', label: 'Sleeve', value: flatData.sleeve },
      { key: 'bottom_fold', label: 'Bottom Fold', value: flatData.bottomFold },
      { key: 'front_open_style', label: 'Front Open Style', value: flatData.frontOpenStyle },
      { key: 'pocket_type', label: 'Pocket Type', value: flatData.pocketType },
      { key: 'fit', label: 'Fit', value: flatData.fit },
      { key: 'pattern', label: 'Pattern', value: flatData.pattern },
      { key: 'length', label: 'Length', value: flatData.length },
      { key: 'colour', label: 'Colour', value: flatData.colour },
      { key: 'drawcord', label: 'Drawcord', value: flatData.drawcord },
      { key: 'button', label: 'Button', value: flatData.button },
      { key: 'zipper', label: 'Zipper', value: flatData.zipper },
      { key: 'zip_colour', label: 'Zip Colour', value: flatData.zipColour },
      { key: 'print_type', label: 'Print Type', value: flatData.printType },
      { key: 'print_style', label: 'Print Style', value: flatData.printStyle },
      { key: 'print_placement', label: 'Print Placement', value: flatData.printPlacement },
      { key: 'patches', label: 'Patches', value: flatData.patches },
      { key: 'patches_type', label: 'Patches Type', value: flatData.patchesType },
      { key: 'embroidery', label: 'Embroidery', value: flatData.embroidery },
      { key: 'embroidery_type', label: 'Embroidery Type', value: flatData.embroideryType },
      { key: 'wash', label: 'Wash', value: flatData.wash },
      { key: 'father_belt', label: 'Father Belt', value: flatData.fatherBelt },
      { key: 'child_belt', label: 'Child Belt', value: flatData.childBelt },
      { key: 'division', label: 'Division', value: flatData.division },
      { key: 'reference_article_number', label: 'Reference Article Number', value: flatData.referenceArticleNumber },
      { key: 'reference_article_description', label: 'Reference Article Description', value: flatData.referenceArticleDescription },
    ];

    return attributeMapping
      .filter(attr => attr.value !== null && attr.value !== undefined && attr.value !== '')
      .map(attr => ({
        attribute: { key: attr.key, label: attr.label },
        rawValue: String(attr.value),
        finalValue: String(attr.value),
        confidence: flatData.avgConfidence ? Number(flatData.avgConfidence) : undefined
      }));
  }, []);

  // Removed buildDetailsRowsWithMajor - category now comes from job.category.name

  const buildOrderedExportDataFromResults = useCallback((items: ProductRow[]) => {
    // Define numeric fields that should only contain numbers in Excel
    const numericFields = new Set(['COST', 'NET PRICE', 'MAXIMUM RETAIL PRICE', 'RATE']);

    return items.map((row) => {
      const byKey = new Map<string, ProductRow['results'][number]>();
      const byLabel = new Map<string, ProductRow['results'][number]>();

      (row.results || []).forEach((item) => {
        const key = item.attribute?.key?.toLowerCase();
        const label = item.attribute?.label?.toLowerCase();
        if (key) byKey.set(key, item);
        if (label) byLabel.set(label, item);
      });

      const record: Record<string, string | number | undefined> = {};
      ORDERED_EXPORT_HEADERS.forEach((header) => {
        if (header === 'CREATION DATE') {
          record[header] = row.createdAt || '';
          return;
        }

        const schemaKey = HEADER_TO_SCHEMA_KEY[header];
        const match = schemaKey
          ? byKey.get(schemaKey.toLowerCase())
          : byLabel.get(header.toLowerCase());

        let value = match?.finalValue ?? match?.rawValue ?? '';

        // For numeric fields, only export valid numbers
        if (numericFields.has(header)) {
          const numValue = typeof value === 'number' ? value : parseFloat(String(value));
          // Only set if it's a valid number, otherwise leave empty
          record[header] = !isNaN(numValue) && isFinite(numValue) ? numValue : undefined;
        } else {
          record[header] = value ?? '';
        }
      });

      return record;
    });
  }, []);

  const handleView = useCallback((row: ProductRow) => {
    if (!row.imageUrl) {
      message.warning('No image available for this extraction');
      return;
    }
    setSelectedImage({ url: row.imageUrl, name: row.name });
  }, []);

  const handleViewDetails = useCallback((row: ProductRow) => {
    setDetailsRow(row);
  }, []);

  const handleExport = useCallback(async (row: ProductRow) => {
    if (!row.results || row.results.length === 0 || row.status !== 'COMPLETED') {
      message.warning('No completed extraction to export');
      return;
    }
    const exportData = buildOrderedExportDataFromResults([row]);
    await exportToExcel(exportData, ORDERED_EXPORT_HEADERS, exportSchema, row.productType || 'results');
  }, [buildOrderedExportDataFromResults, exportSchema]);

  const handleBulkExport = useCallback(async () => {
    if (selectedRows.length === 0) {
      message.warning('Select at least one product to export');
      return;
    }

    const completedRows = selectedRows.filter(
      row => row.status === 'COMPLETED' && row.results && row.results.length > 0
    );

    if (completedRows.length === 0) {
      message.warning('No completed extractions in the selection');
      return;
    }

    if (completedRows.length !== selectedRows.length) {
      message.info('Some selected items are not completed and will be skipped');
    }

    const exportData = buildOrderedExportDataFromResults(completedRows);
    await exportToExcel(exportData, ORDERED_EXPORT_HEADERS, exportSchema, 'bulk');
  }, [buildOrderedExportDataFromResults, exportSchema, selectedRows]);

  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: 'Image',
        key: 'image',
        render: (_: unknown, row: ProductRow) => (
          <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: '#f5f5f5' }}>
            {row.imageUrl ? (
              <img
                src={row.imageUrl}
                alt={row.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : null}
          </div>
        )
      },
      {
        title: 'Extracted Data',
        key: 'extractedData',
        render: (_: unknown, row: ProductRow) => {
          const items = (row.results || [])
            .filter(item => {
              const raw = item.rawValue;
              const final = item.finalValue;
              const hasRaw = typeof raw === 'string' ? raw.trim() !== '' : raw !== null && raw !== undefined;
              const hasFinal = typeof final === 'string' ? final.trim() !== '' : final !== null && final !== undefined;
              return hasRaw || hasFinal;
            })
            .slice(0, 6)
            .map(item => `${item.attribute?.label || item.attribute?.key}: ${item.finalValue ?? item.rawValue ?? '—'}`);
          return (
            <div style={{ maxWidth: 420 }}>
              {items.length > 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>{items.join(', ')}</Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </div>
          );
        }
      },
      ...(isAdmin ? [
        {
          title: 'User',
          key: 'user',
          render: (_: unknown, row: ProductRow) => (
            <div>
              <div>{row.userName || '—'}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{row.userEmail || ''}</Text>
            </div>
          )
        }
      ] : []),
      {
        title: 'Created At',
        dataIndex: 'createdAt',
        key: 'createdAt'
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: ProductRow['status']) => {
          const color = status === 'COMPLETED'
            ? 'green'
            : status === 'FAILED'
              ? 'red'
              : status === 'PROCESSING'
                ? 'blue'
                : 'gold';
          return <Tag color={color} className="products-status-tag">{status}</Tag>;
        }
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, row: ProductRow) => (
          <Space>
            <Button size="small" onClick={() => handleView(row)} disabled={!row.imageUrl}>
              View Image
            </Button>
            <Button size="small" onClick={() => handleViewDetails(row)}>
              Details
            </Button>
            <Button size="small" onClick={() => handleExport(row)} disabled={!row.results?.length || row.status !== 'COMPLETED'}>
              Download
            </Button>
          </Space>
        )
      }
    ];
    return baseColumns;
  }, [handleExport, handleView, handleViewDetails, isAdmin]);

  useEffect(() => {
    const fetchRows = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${APP_CONFIG.api.baseURL}/user/extraction/history/flat`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });

        if (!response.ok) {
          throw new Error('Failed to fetch extraction history');
        }

        const result = await response.json();
        const flatJobs = result?.data?.jobs || [];

        // Creator-only frontend safety filter. Other roles follow backend RBAC scope.
        const userScopedJobs = isCreator
          ? flatJobs.filter((flat: any) => {
              const flatUserId = flat?.userId ? String(flat.userId) : null;
              const flatUserEmail = flat?.userEmail ? String(flat.userEmail).toLowerCase() : null;

              if (currentUserId && flatUserId) {
                return flatUserId === currentUserId;
              }

              if (currentUserEmail && flatUserEmail) {
                return flatUserEmail === currentUserEmail;
              }

              return false;
            })
          : flatJobs;

        // Map flat table data directly (no need to search through results!)
        const mapped: ProductRow[] = userScopedJobs.map((flat: any) => {
          const row = {
            key: flat.jobId,
            userId: flat.userId ? String(flat.userId) : null,
            name: flat.imageName || flat.designNumber || flat.jobId,
            productType: flat.majorCategory || '—',
            vendor: flat.vendorName || '—',
            status: normalizeStatus(flat.extractionStatus),
            rawStatus: flat.extractionStatus,
            createdAt: flat.createdAt ? new Date(flat.createdAt).toLocaleDateString() : '—',
            updatedAt: flat.updatedAt ? new Date(flat.updatedAt).toLocaleDateString() : '—',
            userName: flat.userName,
            userEmail: flat.userEmail || null,
            imageUrl: getImageUrl(flat.imageUrl) || null,
            results: [] as any[], // Will populate below
            // Store flat data for potential future use
            flatData: flat
          };

          // Populate results from flat data for export functionality
          row.results = buildDetailsRows(row);

          return row;
        });

        setRows(mapped);
        localStorage.setItem('extractionsLastUpdated', `${Date.now()}`);
      } catch (error) {
        message.error('Unable to load extraction history');
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [currentUserEmail, currentUserId, isAdmin, isCreator, normalizeStatus, buildDetailsRows]);

  useEffect(() => {
    const fetchMasterAttributes = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${APP_CONFIG.api.baseURL}/user/attributes?includeValues=true`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });

        if (!response.ok) return;

        const result = await response.json().catch(() => null);
        const data = result?.data;
        if (!Array.isArray(data)) return;

        setMasterAttributes(mapMasterAttributes(data));
      } catch {
        // ignore
      }
    };

    fetchMasterAttributes();
  }, []);

  const filteredRows = rows.filter(row => {
    const haystack = `${row.name} ${row.productType} ${row.vendor} ${row.userName || ''} ${row.userEmail || ''}`
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="products-page">
      <div className="products-hero">
        <div>
          <Title level={2} className="products-title">History</Title>
          <Text type="secondary">
            Your extraction history with direct extracted data and export options.
          </Text>
        </div>
        <Space size="middle">
          <Button
            onClick={handleBulkExport}
            disabled={selectedRows.length === 0}
          >
            Bulk Download
          </Button>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search history"
            className="products-search"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Space>
      </div>

      <Card className="products-table-card">
        {filteredRows.length === 0 ? (
          <Empty description="No extraction history yet" />
        ) : (
          <Table
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 8 }}
            className="products-table"
            loading={loading}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys, selected) => {
                setSelectedRowKeys(keys as string[]);
                setSelectedRows(selected as ProductRow[]);
              }
            }}
          />
        )}
      </Card>

      <Modal
        title={selectedImage?.name || 'Uploaded Image'}
        open={!!selectedImage}
        onCancel={() => setSelectedImage(null)}
        footer={null}
        width={720}
      >
        {selectedImage?.url ? (
          <Image src={selectedImage.url} alt={selectedImage.name} style={{ width: '100%' }} />
        ) : (
          <Empty description="No image available" />
        )}
      </Modal>

      <Modal
        title={detailsRow?.name || 'Extraction Details'}
        open={!!detailsRow}
        onCancel={() => setDetailsRow(null)}
        footer={null}
        width={900}
      >
        {detailsRow ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Major Category">{detailsRow.productType || '—'}</Descriptions.Item>
              <Descriptions.Item label="Status">{detailsRow.status}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{detailsRow.vendor || '—'}</Descriptions.Item>
              <Descriptions.Item label="Updated At">{detailsRow.updatedAt || '—'}</Descriptions.Item>
              <Descriptions.Item label="Created At">{detailsRow.createdAt || '—'}</Descriptions.Item>
              {detailsRow.userName ? (
                <Descriptions.Item label="User">{detailsRow.userName} ({detailsRow.userEmail || '—'})</Descriptions.Item>
              ) : null}
            </Descriptions>

            <div>
              <Text strong>Extraction Result</Text>
              <Table
                size="small"
                rowKey={(row) => `${row.attribute?.key || row.attribute?.label}-${row.rawValue}-${row.finalValue}`}
                dataSource={buildDetailsRows(detailsRow)}
                columns={[
                  {
                    title: 'Attribute',
                    dataIndex: 'attribute',
                    key: 'attribute',
                    render: (attr: ProductRow['results'][number]['attribute']) => attr?.label || attr?.key || '—'
                  },
                  {
                    title: 'Raw Value',
                    dataIndex: 'rawValue',
                    key: 'rawValue',
                    render: (value: string | null) => value || '—'
                  },
                  {
                    title: 'Final Value',
                    dataIndex: 'finalValue',
                    key: 'finalValue',
                    render: (value: string | null) => value || '—'
                  },
                  {
                    title: 'Confidence',
                    dataIndex: 'confidence',
                    key: 'confidence',
                    render: (confidence: number | null | undefined) =>
                      typeof confidence === 'number' ? `${confidence}%` : '—'
                  }
                ]}
                pagination={{ pageSize: 12 }}
                locale={{ emptyText: 'No extraction data available' }}
              />
            </div>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}
