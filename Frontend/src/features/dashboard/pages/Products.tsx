import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Typography, Empty, message, Modal, Image, Descriptions, Form, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { APP_CONFIG } from '../../../constants/app/config';
import type { SchemaItem } from '../../../shared/types/extraction/ExtractionTypes';
import {
  exportToExcel,
  mapMasterAttributes,
} from '../../../shared/utils/export/extractionExport';
import { SIMPLE_APPROVER_EXPORT_HEADERS } from '../../approver/pages/ApproverDashboard';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
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
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  sapSyncStatus?: 'NOT_SYNCED' | 'PENDING' | 'SYNCED' | 'FAILED' | null;
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

type HierarchySubDivision = {
  id: number;
  code: string;
  name: string;
  departmentId?: number;
  department?: {
    id?: number;
    code?: string;
    name?: string;
  } | null;
};

const EDITABLE_ATTRIBUTE_DEFINITIONS: EditableAttributeDefinition[] = [
  // Header
  { key: 'division',                       label: 'Division',                      field: 'division' },
  { key: 'sub_division',                   label: 'Sub-Division',                  field: 'subDivision' },
  { key: 'major_category',                 label: 'Major Category',                field: 'majorCategory' },
  { key: 'design_number',                  label: 'Design Number',                 field: 'designNumber' },
  { key: 'vendor_name',                    label: 'Vendor Name',                   field: 'vendorName' },
  { key: 'reference_article_number',       label: 'Reference Article Number',      field: 'referenceArticleNumber' },
  { key: 'reference_article_description',  label: 'Reference Article Description', field: 'referenceArticleDescription' },
  { key: 'rate',                           label: 'Rate/Cost',                     field: 'rate' },
  { key: 'mrp',                            label: 'MRP',                           field: 'mrp' },
  { key: 'imp_atrbt_2',                    label: 'IMP_ATRBT-2',                   field: 'impAtrbt2' },
  // FAB
  { key: 'macro_mvgr',      label: 'OTHER MVGR',           field: 'macroMvgr' },
  { key: 'yarn_01',         label: 'F_YARN',               field: 'yarn1' },
  { key: 'main_mvgr',       label: 'F_FABRIC MAIN MVGR-01', field: 'mainMvgr' },
  { key: 'fabric_main_mvgr', label: 'F_FABRIC MAIN MVGR-02', field: 'fabricMainMvgr' },
  { key: 'weave',           label: 'F_WEAVE_01',           field: 'weave' },
  { key: 'm_fab2',          label: 'F_WEAVE_02',           field: 'mFab2' },
  { key: 'composition',     label: 'F_COMP',               field: 'composition' },
  { key: 'f_count',         label: 'F_COUNT',              field: 'fCount' },
  { key: 'f_construction',  label: 'F_CONSTRUCTION',       field: 'fConstruction' },
  { key: 'lycra_non_lycra', label: 'F_STRETCH',            field: 'lycra' },
  { key: 'finish',          label: 'F_FINISH',             field: 'finish' },
  { key: 'gsm',             label: 'F_GSM_GLM',            field: 'gsm' },
  { key: 'f_ounce',         label: 'F_OUNCE',              field: 'fOunce' },
  { key: 'f_width',         label: 'F_WIDTH',              field: 'fWidth' },
  // BODY
  { key: 'collar',          label: 'COLLAR TYPE',          field: 'collar' },
  { key: 'collar_style',    label: 'COLLAR STYLE',         field: 'collarStyle' },
  { key: 'neck',            label: 'NECK TYPE',            field: 'neck' },
  { key: 'neck_details',    label: 'NECK STYLE',           field: 'neckDetails' },
  { key: 'placket',         label: 'PLACKET',              field: 'placket' },
  { key: 'father_belt',     label: 'BELT',                 field: 'fatherBelt' },
  { key: 'sleeve',          label: 'SLEEVE',               field: 'sleeve' },
  { key: 'sleeve_fold',     label: 'SLEEVE FOLD',          field: 'sleeveFold' },
  { key: 'bottom_fold',     label: 'BOTTOM FOLD',          field: 'bottomFold' },
  { key: 'no_of_pocket',    label: 'NO. OF POCKET',        field: 'noOfPocket' },
  { key: 'pocket_type',     label: 'POCKET TYPE',          field: 'pocketType' },
  { key: 'extra_pocket',    label: 'EXTRA POCKET',         field: 'extraPocket' },
  { key: 'fit',             label: 'FIT',                  field: 'fit' },
  { key: 'body_style',      label: 'BODY STYLE',           field: 'pattern' },
  { key: 'length',          label: 'LENGTH',               field: 'length' },
  // VA ACC.
  { key: 'drawcord',        label: 'DC_TYPE',              field: 'drawcord' },
  { key: 'dc_shape',        label: 'DC_SHAPE',             field: 'dcShape' },
  { key: 'button',          label: 'BTN_TYPE',             field: 'button' },
  { key: 'btn_colour',      label: 'BTN_CLR',              field: 'btnColour' },
  { key: 'zipper',          label: 'ZIP_TYPE',             field: 'zipper' },
  { key: 'zip_colour',      label: 'ZIP_CLR',              field: 'zipColour' },
  { key: 'patches',         label: 'PATCH_TYPE',           field: 'patches' },
  { key: 'patches_type',    label: 'PATCH_STYLE',          field: 'patchesType' },
  // VA PRCS
  { key: 'print_type',      label: 'PRT_TYPE',             field: 'printType' },
  { key: 'print_style',     label: 'PRT_STYLE',            field: 'printStyle' },
  { key: 'print_placement', label: 'PRT_PLCMNT',           field: 'printPlacement' },
  { key: 'embroidery',      label: 'EMB_TYPE',             field: 'embroidery' },
  { key: 'embroidery_type', label: 'EMB_STYLE',            field: 'embroideryType' },
  { key: 'wash',            label: 'WASH',                 field: 'wash' },
];

// ── Variant sub-table (read-only) used in the Products history view ───────────

type VariantRow = {
  id: string;
  variantSize: string | null;
  variantColor: string | null;
  approvalStatus: string | null;
  majorCategory: string | null;
};

const VariantReadOnlySubTable: React.FC<{ jobId: string }> = ({ jobId }) => {
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('authToken');
        const resp = await fetch(
          `${APP_CONFIG.api.baseURL}/approver/items/${encodeURIComponent(jobId)}/variants`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        if (!resp.ok) return;
        const result = await resp.json();
        const data: VariantRow[] = (result.data || result).map((v: any) => ({
          id: String(v.id),
          variantSize: v.variantSize ?? null,
          variantColor: v.variantColor ?? null,
          approvalStatus: v.approvalStatus ?? null,
          majorCategory: v.majorCategory ?? null,
        }));
        setVariants(data);
      } catch {
        // silently ignore — variants are supplementary
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [jobId]);

  if (loading) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <Spin size="small" />
        <Typography.Text type="secondary" style={{ marginLeft: 8 }}>Loading variants…</Typography.Text>
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ padding: '8px 16px', display: 'block' }}>
        No variants for this article.
      </Typography.Text>
    );
  }

  return (
    <div style={{ padding: '8px 16px', background: '#fafafa', borderRadius: 6 }}>
      <Typography.Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
        Variants ({variants.length})
      </Typography.Text>
      <Table<VariantRow>
        dataSource={variants}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'Size',
            dataIndex: 'variantSize',
            key: 'variantSize',
            width: 90,
            render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: 'Color',
            dataIndex: 'variantColor',
            key: 'variantColor',
            width: 140,
            render: (v: string | null) =>
              v ? <Tag color="blue">{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: 'Status',
            dataIndex: 'approvalStatus',
            key: 'approvalStatus',
            width: 110,
            render: (status: string | null) => {
              const s = status || 'PENDING';
              const color = s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : 'gold';
              return <Tag color={color}>{s}</Tag>;
            },
          },
          {
            title: 'Major Category',
            dataIndex: 'majorCategory',
            key: 'majorCategory',
            width: 160,
            render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
          },
        ]}
      />
    </div>
  );
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
  const normalizedRole = String(userData?.role || '').toUpperCase();
  const isAdmin = normalizedRole === 'ADMIN';
  const isCreatorLike = normalizedRole === 'CREATOR' || normalizedRole === 'PO_COMMITTEE';
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
  const [allSubDivisions, setAllSubDivisions] = useState<HierarchySubDivision[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [subDivisionFilter, setSubDivisionFilter] = useState<string>('ALL');

  // Scroll-y: measure from table wrapper top to viewport bottom, subtract fixed chrome
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(500);
  const recalcScrollY = useCallback(() => {
    const el = tableWrapperRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    setScrollY(Math.max(200, window.innerHeight - top - 35 - 40 - 16 - 8));
  }, []);
  useEffect(() => {
    recalcScrollY();
    window.addEventListener('resize', recalcScrollY);
    return () => window.removeEventListener('resize', recalcScrollY);
  }, [recalcScrollY]);

  const normalizeStatus = useCallback((status?: string | null): ProductRow['status'] => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') return 'COMPLETED';
    if (normalized === 'error' || normalized === 'failed' || normalized === 'fail') return 'FAILED';
    if (normalized === 'processing' || normalized === 'extracting') return 'PROCESSING';
    return 'PENDING';
  }, []);

  const getDisplayStatus = useCallback((flat: any): ProductRow['status'] => {
    const approvalStatus = String(flat?.approvalStatus || '').toUpperCase();
    const sapSyncStatus = String(flat?.sapSyncStatus || '').toUpperCase();
    const extractionStatus = normalizeStatus(flat?.extractionStatus);

    // Rejection always shows as failed
    if (approvalStatus === 'REJECTED') return 'FAILED';
    // If approved, always show as completed regardless of SAP sync status
    if (approvalStatus === 'APPROVED') return 'COMPLETED';
    // Only show SAP failure for non-approved articles
    if (sapSyncStatus === 'FAILED') return 'FAILED';

    return extractionStatus;
  }, [normalizeStatus]);

  const canEditRow = useCallback((row: ProductRow) => {
    // Admin can always edit
    if (isAdmin) return true;

    const approvalStatus = String(row.approvalStatus || row.flatData?.approvalStatus || '').toUpperCase();
    const sapSyncStatus = String(row.sapSyncStatus || row.flatData?.sapSyncStatus || '').toUpperCase();

    if (approvalStatus !== 'APPROVED') return true;

    return sapSyncStatus !== 'SYNCED';
  }, [isAdmin]);

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

  const normalizeAttrKey = useCallback((key: string) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, ''), []);

  const attributeOptionsByKey = useMemo(() => {
    const map = new Map<string, Array<{ label: string; value: string }>>();

    masterAttributes.forEach((attr) => {
      const options = (attr.allowedValues || [])
        .map((value) => {
          const short = (value?.shortForm || '').trim();
          const full = (value?.fullForm || '').trim();
          if (!short && !full) return null;

          const optionValue = short || full;
          const optionLabel = full && short ? `${short} - ${full}` : optionValue;
          return { label: optionLabel, value: optionValue };
        })
        .filter((item): item is { label: string; value: string } => !!item);

      if (options.length > 0) {
        map.set(normalizeAttrKey(attr.key), options);
      }
    });

    return map;
  }, [masterAttributes, normalizeAttrKey]);

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
        value: item.field === 'division' ? formatDivisionLabel(flatData[item.field]) : flatData[item.field]
      })),
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

  const buildExportData = useCallback((items: ProductRow[]) => {
    return items.map((row) => {
      const flat = row.flatData || {};
      const createdAt = flat.createdAt ? new Date(flat.createdAt) : null;
      const formattedDate = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleDateString('en-GB')
        : '';
      return {
        'Article Number': flat.articleNumber || flat.imageName || '',
        'Division': flat.division || '',
        'Sub Division': flat.subDivision || '',
        'Major Category': flat.majorCategory || '',
        'Status': flat.approvalStatus || '',
        'Vendor Name': flat.vendorName || '',
        'Vendor Code': flat.vendorCode || '',
        'Design Number': flat.designNumber || '',
        'PPT Number': flat.pptNumber || '',
        'Rate': flat.rate == null ? undefined : Number(flat.rate),
        'MRP': flat.mrp == null ? undefined : Number(flat.mrp),
        'Size': flat.size || '',
        'Pattern': flat.pattern || '',
        'Fit': flat.fit || '',
        'Wash': flat.wash || '',
        'Macro MVGR': flat.macroMvgr || '',
        'Main MVGR': flat.mainMvgr || '',
        'Yarn 1': flat.yarn1 || '',
        'Fabric Main MVGR': flat.fabricMainMvgr || '',
        'Weave': flat.weave || '',
        'M FAB 2': flat.mFab2 || '',
        'Composition': flat.composition || '',
        'Finish': flat.finish || '',
        'GSM': flat.gsm || '',
        'Weight': flat.weight || '',
        'Lycra': flat.lycra || '',
        'Shade': flat.shade || '',
        'Neck': flat.neck || '',
        'Neck Details': flat.neckDetails || '',
        'Sleeve': flat.sleeve || '',
        'Length': flat.length || '',
        'Collar': flat.collar || '',
        'Placket': flat.placket || '',
        'Bottom Fold': flat.bottomFold || '',
        'Front Open Style': flat.frontOpenStyle || '',
        'Pocket Type': flat.pocketType || '',
        'Drawcord': flat.drawcord || '',
        'Button': flat.button || '',
        'Zipper': flat.zipper || '',
        'Zip Colour': flat.zipColour || '',
        'Father Belt': flat.fatherBelt || '',
        'Child Belt': flat.childBelt || '',
        'Print Type': flat.printType || '',
        'Print Style': flat.printStyle || '',
        'Print Placement': flat.printPlacement || '',
        'Patches': flat.patches || '',
        'Patches Type': flat.patchesType || '',
        'Embroidery': flat.embroidery || '',
        'Embroidery Type': flat.embroideryType || '',
        'Reference Article Number': flat.referenceArticleNumber || '',
        'Reference Article Description': flat.referenceArticleDescription || '',
        'MC Code': flat.mcCode || '',
        'Segment': flat.segment || '',
        'Season': flat.season || '',
        'HSN Tax Code': flat.hsnTaxCode || '',
        'Article Description': flat.articleDescription || '',
        'Fashion Grid': flat.fashionGrid || '',
        'Year': flat.year || '',
        'Article Type': flat.articleType || '',
        'Extracted By': flat.userName || '',
        'Created Date': formattedDate,
      };
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
    const exportData = buildExportData([row]);
    await exportToExcel(exportData, [...SIMPLE_APPROVER_EXPORT_HEADERS], [], row.productType || 'results');
  }, [buildExportData]);

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

    const exportData = buildExportData(completedRows);
    await exportToExcel(exportData, [...SIMPLE_APPROVER_EXPORT_HEADERS], [], 'bulk');
  }, [buildExportData, selectedRows]);

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
            {isCreatorLike ? (
              <Button size="small" disabled title="Editing is not allowed for Creator role">
                Edit
              </Button>
            ) : canEditRow(row) ? (
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
  }, [canEditRow, handleExport, handleOpenEdit, handleView, handleViewDetails, isAdmin]);

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
        const userScopedJobs = isCreatorLike
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
            status: getDisplayStatus(flat),
            rawStatus: flat.extractionStatus,
            approvalStatus: flat.approvalStatus || null,
            sapSyncStatus: flat.sapSyncStatus || null,
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
        // Re-measure after data renders so table wrapper has its final position
        setTimeout(recalcScrollY, 50);
      } catch (error) {
        message.error('Unable to load extraction history');
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [currentUserEmail, currentUserId, isAdmin, isCreatorLike, getDisplayStatus, buildDetailsRows, recalcScrollY]);

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

  // Normalize division: treat MEN and MENS as MENS
  const normalizeDivision = (v: string) => v === 'MEN' ? 'MENS' : v;

  useEffect(() => {
    const fetchSubDivisions = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${APP_CONFIG.api.baseURL}/user/sub-departments`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });

        if (!response.ok) return;

        const result = await response.json().catch(() => null);
        const data = result?.data;
        if (!Array.isArray(data)) return;

        setAllSubDivisions(data);
      } catch {
        // ignore and fall back to extracted values already present in rows
      }
    };

    fetchSubDivisions();
  }, []);

  // Unique division/subdivision values present in the data (for filter dropdowns)
  const divisionOptions = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach(r => { const v = r.flatData?.division; if (v) seen.add(normalizeDivision(String(v).toUpperCase())); });
    return Array.from(seen).sort();
  }, [rows]);

  const subDivisionOptions = useMemo(() => {
    const seen = new Set<string>();
    allSubDivisions.forEach((subDivision) => {
      const parentDivision = normalizeDivision(String(
        subDivision.department?.code ||
        subDivision.department?.name ||
        ''
      ).toUpperCase());

      if (divisionFilter !== 'ALL' && parentDivision !== divisionFilter) return;

      const value = String(subDivision.code || '').toUpperCase().trim();
      if (value) seen.add(value);
    });

    if (seen.size === 0) {
      rows.forEach(r => {
        if (divisionFilter !== 'ALL' && normalizeDivision(String(r.flatData?.division || '').toUpperCase()) !== divisionFilter) return;
        const v = r.flatData?.subDivision;
        if (v) seen.add(String(v).toUpperCase());
      });
    }

    return Array.from(seen).sort();
  }, [allSubDivisions, rows, divisionFilter]);

  // Show division/sub-division filter for admin or users with data spanning multiple divisions
  const showDivisionFilter = isAdmin || divisionOptions.length > 1;
  const showSubDivisionFilter = subDivisionOptions.length > 1;

  useEffect(() => {
    if (subDivisionFilter !== 'ALL' && !subDivisionOptions.includes(subDivisionFilter)) {
      setSubDivisionFilter('ALL');
    }
  }, [subDivisionFilter, subDivisionOptions]);

  const filteredRows = useMemo(() => rows.filter(row => {
    if (divisionFilter !== 'ALL' && normalizeDivision(String(row.flatData?.division || '').toUpperCase()) !== divisionFilter) return false;
    if (subDivisionFilter !== 'ALL' && String(row.flatData?.subDivision || '').toUpperCase() !== subDivisionFilter) return false;
    const haystack = `${row.name} ${row.productType} ${row.vendor} ${row.userName || ''} ${row.userEmail || ''}`
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [rows, divisionFilter, subDivisionFilter, search]);

  return (
    <div className="products-page">
      <div className="products-hero">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Title level={4} className="products-title" style={{ margin: 0 }}>History</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Extraction history with export options.</Text>
        </div>
        <Space size="small" wrap>
          {showDivisionFilter && (
            <Select
              style={{ minWidth: 130 }}
              value={divisionFilter}
              onChange={(v) => { setDivisionFilter(v); setSubDivisionFilter('ALL'); }}
              size="small"
            >
              <Select.Option value="ALL">All Divisions</Select.Option>
              {divisionOptions.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
            </Select>
          )}
          {showSubDivisionFilter && (
            <Select
              style={{ minWidth: 130 }}
              value={subDivisionFilter}
              onChange={setSubDivisionFilter}
              size="small"
            >
              <Select.Option value="ALL">All Sub-Divs</Select.Option>
              {subDivisionOptions.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
            </Select>
          )}
          <Button size="small" onClick={handleBulkExport} disabled={selectedRows.length === 0}>
            Bulk Download
          </Button>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search history"
            className="products-search"
            allowClear
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Space>
      </div>

      <Card className="products-table-card" styles={{ body: { padding: '6px 8px' } }}>
        <div ref={tableWrapperRef}>
          <Table
            columns={columns}
            dataSource={filteredRows}
            rowKey={(row) => row.key}
            size="small"
            expandable={{
              expandedRowRender: (record) => (
                <VariantReadOnlySubTable jobId={record.flatData?.id || record.jobId} />
              ),
              expandRowByClick: false,
              rowExpandable: () => true,
            }}
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              pageSizeOptions: ['50', '100', '200'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              position: ['bottomRight'],
            }}
            className="products-table"
            loading={loading}
            locale={{ emptyText: <Empty description="No extraction history yet" /> }}
            scroll={{ x: 'max-content', y: scrollY }}
            sticky
            rowSelection={{
              selectedRowKeys,
              onChange: (keys, selected) => {
                setSelectedRowKeys(keys as string[]);
                setSelectedRows(selected as ProductRow[]);
              }
            }}
          />
        </div>
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
              <Fragment key={item.key}>
                <Form.Item label={item.label} style={{ marginBottom: 12 }}>
                  {(() => {
                    const options = attributeOptionsByKey.get(normalizeAttrKey(item.key)) || [];
                    if (options.length > 0) {
                      return (
                        <Select
                          showSearch
                          allowClear
                          options={options}
                          optionFilterProp="label"
                          value={editValues[item.key] || undefined}
                          onChange={(value) => setEditValues((prev) => ({ ...prev, [item.key]: value ?? '' }))}
                          disabled={savingEdits}
                          placeholder={`Select ${item.label}`}
                        />
                      );
                    }

                    return (
                      <Input
                        value={editValues[item.key] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditValues((prev) => {
                            const next = { ...prev, [item.key]: val };
                            if (item.key === 'rate') {
                              const rate = parseFloat(val);
                              if (!isNaN(rate) && rate > 0) {
                                next['mrp'] = String(Math.ceil(rate * 1.47 / 25) * 25);
                              }
                            }
                            return next;
                          });
                        }}
                        disabled={savingEdits}
                        placeholder={`Enter ${item.label}`}
                      />
                    );
                  })()}
                </Form.Item>
                {item.key === 'mrp' && (() => {
                  const mrp = parseFloat(String(editValues['mrp'] ?? ''));
                  const rate = parseFloat(String(editValues['rate'] ?? ''));
                  if (!isFinite(mrp) || !isFinite(rate) || mrp === 0) return null;
                  const md = ((mrp - rate) / mrp * 100).toFixed(1);
                  return (
                    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6, padding: '6px 12px', marginBottom: 12, fontSize: 13 }}>
                      <span style={{ color: '#595959' }}>Markdown: </span>
                      <span style={{ fontWeight: 700, color: '#2f54eb' }}>{md}%</span>
                      <span style={{ color: '#8c8c8c', marginLeft: 8, fontSize: 12 }}>(MRP − Rate) ÷ MRP × 100</span>
                    </div>
                  );
                })()}
              </Fragment>
            ))}
          </div>
        </Form>
      </Modal>
    </div>
  );
}
