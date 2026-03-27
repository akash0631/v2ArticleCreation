import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Space, Table, Tag, Typography, Empty, message, Modal, Image, Descriptions, Form } from 'antd';
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
  jobId: string;
  userId?: string | null;
  name: string;
  productType: string;
  vendor: string;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING' | 'PENDING';
  rawStatus?: string | null;
  createdAt: string;
  createdAtTs?: number;
  updatedAt: string;
  updatedAtTs?: number;
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

type EditableAttributeDefinition = {
  key: string;
  label: string;
  field: string;
};

const EDITABLE_ATTRIBUTE_DEFINITIONS: EditableAttributeDefinition[] = [
  { key: 'major_category', label: 'Major Category', field: 'majorCategory' },
  { key: 'vendor_name', label: 'Vendor Name', field: 'vendorName' },
  { key: 'design_number', label: 'Design Number', field: 'designNumber' },
  { key: 'ppt_number', label: 'PPT Number', field: 'pptNumber' },
  { key: 'rate', label: 'Rate', field: 'rate' },
  { key: 'size', label: 'Size', field: 'size' },
  { key: 'yarn_01', label: 'Yarn 1', field: 'yarn1' },
  { key: 'yarn_02', label: 'Yarn 2', field: 'yarn2' },
  { key: 'fabric_main_mvgr', label: 'Fabric Main MVGR', field: 'fabricMainMvgr' },
  { key: 'weave', label: 'Weave', field: 'weave' },
  { key: 'composition', label: 'Composition', field: 'composition' },
  { key: 'finish', label: 'Finish', field: 'finish' },
  { key: 'gsm', label: 'GSM', field: 'gsm' },
  { key: 'shade', label: 'Shade', field: 'shade' },
  { key: 'weight', label: 'G-Weight', field: 'weight' },
  { key: 'lycra_non_lycra', label: 'Lycra', field: 'lycra' },
  { key: 'neck', label: 'Neck', field: 'neck' },
  { key: 'neck_details', label: 'Neck Details', field: 'neckDetails' },
  { key: 'collar', label: 'Collar', field: 'collar' },
  { key: 'placket', label: 'Placket', field: 'placket' },
  { key: 'sleeve', label: 'Sleeve', field: 'sleeve' },
  { key: 'bottom_fold', label: 'Bottom Fold', field: 'bottomFold' },
  { key: 'front_open_style', label: 'Front Open Style', field: 'frontOpenStyle' },
  { key: 'pocket_type', label: 'Pocket Type', field: 'pocketType' },
  { key: 'fit', label: 'Fit', field: 'fit' },
  { key: 'pattern', label: 'Pattern', field: 'pattern' },
  { key: 'length', label: 'Length', field: 'length' },
  { key: 'colour', label: 'Colour', field: 'colour' },
  { key: 'drawcord', label: 'Drawcord', field: 'drawcord' },
  { key: 'button', label: 'Button', field: 'button' },
  { key: 'zipper', label: 'Zipper', field: 'zipper' },
  { key: 'zip_colour', label: 'Zip Colour', field: 'zipColour' },
  { key: 'print_type', label: 'Print Type', field: 'printType' },
  { key: 'print_style', label: 'Print Style', field: 'printStyle' },
  { key: 'print_placement', label: 'Print Placement', field: 'printPlacement' },
  { key: 'patches', label: 'Patches', field: 'patches' },
  { key: 'patches_type', label: 'Patches Type', field: 'patchesType' },
  { key: 'embroidery', label: 'Embroidery', field: 'embroidery' },
  { key: 'embroidery_type', label: 'Embroidery Type', field: 'embroideryType' },
  { key: 'wash', label: 'Wash', field: 'wash' },
  { key: 'father_belt', label: 'Father Belt', field: 'fatherBelt' },
  { key: 'child_belt', label: 'Child Belt', field: 'childBelt' },
  { key: 'reference_article_number', label: 'Reference Article Number', field: 'referenceArticleNumber' },
  { key: 'reference_article_description', label: 'Reference Article Description', field: 'referenceArticleDescription' },
];

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
  const [editingRow, setEditingRow] = useState<ProductRow | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editInitialValues, setEditInitialValues] = useState<Record<string, string>>({});
  const [savingEdits, setSavingEdits] = useState(false);
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
      ...EDITABLE_ATTRIBUTE_DEFINITIONS.map((item) => ({
        key: item.key,
        label: item.label,
        value: flatData[item.field]
      })),
      { key: 'division', label: 'Division', value: flatData.division },
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

  const handleOpenEdit = useCallback((row: ProductRow) => {
    const values: Record<string, string> = {};
    EDITABLE_ATTRIBUTE_DEFINITIONS.forEach((item) => {
      const raw = row.flatData?.[item.field];
      values[item.key] = raw === null || raw === undefined ? '' : String(raw);
    });
    setEditingRow(row);
    setEditValues(values);
    setEditInitialValues(values);
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (!editingRow) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      message.error('Unauthorized');
      return;
    }

    const changed = EDITABLE_ATTRIBUTE_DEFINITIONS
      .map((item) => ({
        ...item,
        newValue: (editValues[item.key] ?? '').trim(),
        oldValue: (editInitialValues[item.key] ?? '').trim()
      }))
      .filter((item) => item.newValue !== item.oldValue);

    if (changed.length === 0) {
      message.info('No changes to save');
      return;
    }

    setSavingEdits(true);
    try {
      for (const item of changed) {
        const response = await fetch(`${APP_CONFIG.api.baseURL}/user/extraction/history/flat/job/${encodeURIComponent(editingRow.jobId)}/attribute`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            attributeKey: item.key,
            value: item.newValue
          })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `Failed to save ${item.label}`);
        }
      }

      setRows((prev) => prev.map((row) => {
        if (row.jobId !== editingRow.jobId) return row;

        const nextFlatData = { ...(row.flatData || {}) };
        EDITABLE_ATTRIBUTE_DEFINITIONS.forEach((item) => {
          if (Object.prototype.hasOwnProperty.call(editValues, item.key)) {
            nextFlatData[item.field] = (editValues[item.key] ?? '').trim() || null;
          }
        });

        const nextRow: ProductRow = {
          ...row,
          name: nextFlatData.imageName || nextFlatData.designNumber || nextFlatData.jobId,
          productType: nextFlatData.majorCategory || '—',
          vendor: nextFlatData.vendorName || '—',
          flatData: nextFlatData
        };
        nextRow.results = buildDetailsRows(nextRow);
        return nextRow;
      }));

      if (detailsRow?.jobId === editingRow.jobId) {
        const nextFlatData = { ...(detailsRow.flatData || {}) };
        EDITABLE_ATTRIBUTE_DEFINITIONS.forEach((item) => {
          if (Object.prototype.hasOwnProperty.call(editValues, item.key)) {
            nextFlatData[item.field] = (editValues[item.key] ?? '').trim() || null;
          }
        });

        const nextDetails: ProductRow = {
          ...detailsRow,
          name: nextFlatData.imageName || nextFlatData.designNumber || nextFlatData.jobId,
          productType: nextFlatData.majorCategory || '—',
          vendor: nextFlatData.vendorName || '—',
          flatData: nextFlatData
        };
        nextDetails.results = buildDetailsRows(nextDetails);
        setDetailsRow(nextDetails);
      }

      message.success('Attributes updated successfully');
      setEditingRow(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setSavingEdits(false);
    }
  }, [buildDetailsRows, detailsRow, editInitialValues, editValues, editingRow]);

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
            {row.flatData?.approvalStatus !== 'APPROVED' ? (
              <Button size="small" onClick={() => handleOpenEdit(row)}>
                Edit
              </Button>
            ) : null}
            <Button size="small" onClick={() => handleExport(row)} disabled={!row.results?.length || row.status !== 'COMPLETED'}>
              Download
            </Button>
          </Space>
        )
      }
    ];
    return baseColumns;
  }, [handleExport, handleOpenEdit, handleView, handleViewDetails, isAdmin, isCreator]);

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
        const mapped: ProductRow[] = userScopedJobs.map((flat: any, index: number) => {
          const createdAtDate = flat.createdAt ? new Date(flat.createdAt) : null;
          const updatedAtDate = flat.updatedAt ? new Date(flat.updatedAt) : null;

          const row = {
            key: String(flat.id ?? flat.jobId ?? `${flat.imageName || 'row'}-${index}`),
            jobId: String(flat.jobId || flat.id || ''),
            userId: flat.userId ? String(flat.userId) : null,
            name: flat.imageName || flat.designNumber || flat.jobId,
            productType: flat.majorCategory || '—',
            vendor: flat.vendorName || '—',
            status: normalizeStatus(flat.extractionStatus),
            rawStatus: flat.extractionStatus,
            createdAt: createdAtDate ? createdAtDate.toLocaleString() : '—',
            createdAtTs: createdAtDate ? createdAtDate.getTime() : 0,
            updatedAt: updatedAtDate ? updatedAtDate.toLocaleString() : '—',
            updatedAtTs: updatedAtDate ? updatedAtDate.getTime() : 0,
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
        }).sort((a, b) => {
          const byCreated = (b.createdAtTs || 0) - (a.createdAtTs || 0);
          if (byCreated !== 0) return byCreated;

          const byUpdated = (b.updatedAtTs || 0) - (a.updatedAtTs || 0);
          if (byUpdated !== 0) return byUpdated;

          return b.key.localeCompare(a.key);
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
            rowKey={(row) => row.key}
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

      <Modal
        title={editingRow ? `Edit Attributes - ${editingRow.name}` : 'Edit Attributes'}
        open={!!editingRow}
        onCancel={() => !savingEdits && setEditingRow(null)}
        onOk={handleSaveEdits}
        okText={savingEdits ? 'Saving...' : 'Save'}
        okButtonProps={{ loading: savingEdits }}
        width={920}
      >
        <Form layout="vertical">
          <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 8 }}>
            {EDITABLE_ATTRIBUTE_DEFINITIONS.map((item) => (
              <Form.Item key={item.key} label={item.label} style={{ marginBottom: 12 }}>
                <Input
                  value={editValues[item.key] ?? ''}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  disabled={savingEdits}
                  placeholder={`Enter ${item.label}`}
                />
              </Form.Item>
            ))}
          </div>
        </Form>
      </Modal>
    </div>
  );
}
