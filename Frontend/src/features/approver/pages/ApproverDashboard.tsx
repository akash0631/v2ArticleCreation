import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle2, XCircle, RotateCw, Download, FileText, LayoutGrid, Rocket, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dayjs } from 'dayjs';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  RangePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { ApproverArticleList } from '../components/ApproverArticleList';
import type { ApproverItem, MasterAttribute } from '../components/ApproverTable';
import { APP_CONFIG } from '../../../constants/app/config';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
import { getMcCodeByMajorCategory, MAJOR_CATEGORY_ALLOWED_VALUES } from '../../../data/majorCategoryMcCodeMap';
import {
  getMajCatAllowedValues,
  getMajCatMandatoryKeys,
  SCHEMA_KEY_TO_EXCEL_ATTR,
  normalizeMajorCategory,
} from '../../../data/majCatAttributeMap';
import { preloadAttributeValues } from '../../../services/articleConfigService';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
import { exportToExcel } from '../../../shared/utils/export/extractionExport';

const inferMcCode = (majorCategory?: string | null): string | null => getMcCodeByMajorCategory(majorCategory);

const parseNumericValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/[₹$€£¥,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\/-$/, '')
    .replace(/\/$/, '')
    .replace(/-$/, '')
    .trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
};

const calcMarkdown = (mrp: unknown, rate: unknown): string | null => {
  const m = parseNumericValue(mrp);
  const r = parseNumericValue(rate);
  if (m === null || r === null || m === 0) return null;
  return (((m - r) / m) * 100).toFixed(1) + '%';
};

const normalizeText = (value?: string | null): string => String(value || '').trim().toUpperCase();

const getDivisionVariants = (value?: string | null): string[] => {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  if (normalized === 'MEN' || normalized === 'MENS') return ['MEN', 'MENS'];
  if (normalized === 'LADIES' || normalized === 'WOMEN' || normalized === 'WOMAN') return ['LADIES', 'WOMEN'];
  if (normalized === 'KID' || normalized === 'KIDS') return ['KID', 'KIDS'];
  return [normalized];
};

const getSubDivisionVariants = (value?: string | null): string[] =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[;,|]+/)
        .map((item) => normalizeText(item))
        .filter(Boolean),
    ),
  );

export const SIMPLE_APPROVER_EXPORT_HEADERS = [
  'Article Number', 'Division', 'Sub Division', 'Major Category', 'Status', 'Vendor Name', 'Vendor Code',
  'Design Number', 'PPT Number', 'Rate', 'MRP', 'Size', 'Pattern', 'Fit', 'Wash', 'Macro MVGR', 'Main MVGR',
  'Yarn 1', 'Fabric Main MVGR', 'Weave', 'M FAB 2', 'Composition', 'Finish', 'GSM', 'Weight', 'Lycra',
  'M FAB DIV', 'Shade', 'Neck', 'Neck Details', 'Sleeve', 'Length', 'Collar', 'Placket', 'Bottom Fold',
  'Front Open Style', 'Pocket Type', 'Drawcord', 'Button', 'Zipper', 'Zip Colour', 'Father Belt',
  'Child Belt', 'Print Type', 'Print Style', 'Print Placement', 'Patches', 'Patches Type', 'Embroidery',
  'Embroidery Type', 'Reference Article Number', 'Reference Article Description', 'MC Code', 'Segment',
  'Season', 'HSN Tax Code', 'Article Description', 'Fashion Grid', 'Year', 'Article Type', 'Extracted By',
  'Created Date',
] as const;

const ATTRIBUTE_FIELDS: { formName: string; label: string; schemaKey: string }[] = [
  { formName: 'macroMvgr', label: 'Macro MVGR', schemaKey: 'macro_mvgr' },
  { formName: 'mainMvgr', label: 'Main MVGR', schemaKey: 'main_mvgr' },
  { formName: 'yarn1', label: 'Yarn 1', schemaKey: 'yarn_01' },
  { formName: 'fabricMainMvgr', label: 'Fabric Main MVGR', schemaKey: 'fabric_main_mvgr' },
  { formName: 'weave', label: 'Weave', schemaKey: 'weave' },
  { formName: 'mFab2', label: 'M FAB 2', schemaKey: 'm_fab2' },
  { formName: 'fabDiv', label: 'M FAB DIV', schemaKey: 'fab_div' },
  { formName: 'composition', label: 'Composition', schemaKey: 'composition' },
  { formName: 'finish', label: 'Finish', schemaKey: 'finish' },
  { formName: 'gsm', label: 'GSM', schemaKey: 'gsm' },
  { formName: 'weight', label: 'G-Weight', schemaKey: 'weight' },
  { formName: 'lycra', label: 'Lycra / Non-Lycra', schemaKey: 'lycra_non_lycra' },
  { formName: 'shade', label: 'Shade', schemaKey: 'shade' },
  { formName: 'pattern', label: 'Body Style', schemaKey: 'body_style' },
  { formName: 'fit', label: 'Fit', schemaKey: 'fit' },
  { formName: 'wash', label: 'Wash', schemaKey: 'wash' },
  { formName: 'neck', label: 'Neck', schemaKey: 'neck' },
  { formName: 'neckDetails', label: 'Neck Details', schemaKey: 'neck_details' },
  { formName: 'collar', label: 'Collar', schemaKey: 'collar' },
  { formName: 'placket', label: 'Placket', schemaKey: 'placket' },
  { formName: 'sleeve', label: 'Sleeve', schemaKey: 'sleeve' },
  { formName: 'length', label: 'Length', schemaKey: 'length' },
  { formName: 'bottomFold', label: 'Bottom Fold', schemaKey: 'bottom_fold' },
  { formName: 'frontOpenStyle', label: 'Front Open Style', schemaKey: 'front_open_style' },
  { formName: 'pocketType', label: 'Pocket Type', schemaKey: 'pocket_type' },
  { formName: 'drawcord', label: 'Drawcord', schemaKey: 'drawcord' },
  { formName: 'button', label: 'Button', schemaKey: 'button' },
  { formName: 'zipper', label: 'Zipper', schemaKey: 'zipper' },
  { formName: 'zipColour', label: 'Zip Colour', schemaKey: 'zip_colour' },
  { formName: 'fatherBelt', label: 'Father Belt', schemaKey: 'father_belt' },
  { formName: 'childBelt', label: 'Child Belt', schemaKey: 'child_belt' },
  { formName: 'printType', label: 'Print Type', schemaKey: 'print_type' },
  { formName: 'printStyle', label: 'Print Style', schemaKey: 'print_style' },
  { formName: 'printPlacement', label: 'Print Placement', schemaKey: 'print_placement' },
  { formName: 'patches', label: 'Patches', schemaKey: 'patches' },
  { formName: 'patchesType', label: 'Patches Type', schemaKey: 'patches_type' },
  { formName: 'embroidery', label: 'Embroidery', schemaKey: 'embroidery' },
  { formName: 'embroideryType', label: 'Embroidery Type', schemaKey: 'embroidery_type' },
];

const PAGE_SIZE = 50;

const FIELD_TO_SCHEMA_KEY: Record<string, string> = {
  macroMvgr: 'macro_mvgr', yarn1: 'yarn_01', mainMvgr: 'main_mvgr',
  fabricMainMvgr: 'fabric_main_mvgr', weave: 'weave', mFab2: 'm_fab2',
  composition: 'composition', fCount: 'f_count', fConstruction: 'f_construction',
  lycra: 'lycra_non_lycra', finish: 'finish', gsm: 'gsm',
  fOunce: 'f_ounce', fWidth: 'f_width', fabDiv: 'fab_div',
  collar: 'collar', collarStyle: 'collar_style', neckDetails: 'neck_details',
  neck: 'neck', placket: 'placket', fatherBelt: 'father_belt',
  sleeve: 'sleeve', sleeveFold: 'sleeve_fold', bottomFold: 'bottom_fold',
  noOfPocket: 'no_of_pocket', pocketType: 'pocket_type', extraPocket: 'extra_pocket',
  fit: 'fit', pattern: 'body_style', length: 'length',
  drawcord: 'drawcord', dcShape: 'dc_shape', button: 'button',
  btnColour: 'btn_colour', zipper: 'zipper', zipColour: 'zip_colour',
  patchesType: 'patches_type', patches: 'patches',
  htrfType: 'htrf_type', htrfStyle: 'htrf_style',
  printType: 'print_type', printStyle: 'print_style', printPlacement: 'print_placement',
  embroidery: 'embroidery', embroideryType: 'embroidery_type',
  embPlacement: 'emb_placement', wash: 'wash',
  ageGroup: 'age_group', articleFashionType: 'article_fashion_type',
  mvgrBrandVendor: 'mvgr_brand_vendor',
};

interface ApproverDashboardProps {
  pathType?: 'old' | 'new' | 'rejected' | 'created';
}

type ConfirmDialog =
  | { kind: 'approve'; count: number }
  | { kind: 'reject'; count: number }
  | { kind: 'createFabric'; item: ApproverItem }
  | { kind: 'createBody'; item: ApproverItem }
  | { kind: 'proceedFG'; item: ApproverItem }
  | null;

type InfoDialog =
  | { kind: 'mandatoryMissing'; errors: { articleId: string; missing: string[] }[] }
  | { kind: 'sapSyncFailed'; failures: { id: string; message: string }[]; total: number }
  | { kind: 'sapPartialFailed'; failures: { id: string; message: string }[]; total: number }
  | null;

export default function ApproverDashboard({ pathType }: ApproverDashboardProps = {}) {
  // Single-article view: one article rendered at a time with prev/next.
  // `currentIndex` is the position inside the current server page's items[].
  const [currentIndex, setCurrentIndex] = useState(0);
  const [items, setItems] = useState<ApproverItem[]>([]);
  const [attributes, setAttributes] = useState<MasterAttribute[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [user, setUser] = useState<any>(null);
  const canApprove =
    user?.role === 'ADMIN' || user?.role === 'APPROVER' || user?.role === 'CATEGORY_HEAD' || user?.role === 'SUB_DIVISION_HEAD';
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchText, setSearchText] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [subDivisionFilter, setSubDivisionFilter] = useState<string>('ALL');
  const [majorCategoryFilter, setMajorCategoryFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [infoDialog, setInfoDialog] = useState<InfoDialog>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value === '') {
      setSearchText('');
      return;
    }
    if (value.length < 3) return;
    searchDebounceRef.current = setTimeout(() => setSearchText(value), 700);
  }, []);

  const userAssignedDivisions = useMemo(() => getDivisionVariants(user?.division), [user]);
  const userAssignedSubDivisions = useMemo(() => getSubDivisionVariants(user?.subDivision), [user]);
  const showDivisionFilter = user?.role !== 'ADMIN' && userAssignedDivisions.length > 1;
  const showSubDivisionFilter = user?.role !== 'ADMIN' && userAssignedSubDivisions.length > 1;

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
  }, []);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ApproverItem | null>(null);
  const editForm = useForm<Record<string, any>>({ defaultValues: {} });
  const [modalMarkdown, setModalMarkdown] = useState<string | null>(null);
  const [editActiveTab, setEditActiveTab] = useState<'core' | 'attributes' | 'business'>('core');
  const modalDivision = editForm.watch('division');

  const fetchAttributes = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/attributes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAttributes(data);
      }
    } catch (error) {
      console.error('Failed to fetch attributes', error);
    }
  }, []);

  const fetchItems = useCallback(
    async (page = 1) => {
      setLoading(true);
      setCurrentPage(page);
      try {
        const token = localStorage.getItem('authToken');
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));
        const effectiveStatus =
          pathType === 'new' ? 'PENDING' : pathType === 'rejected' ? 'REJECTED' : pathType === 'created' ? 'APPROVED' : statusFilter;
        params.set('status', effectiveStatus);
        if (divisionFilter !== 'ALL') params.set('division', divisionFilter);
        if (subDivisionFilter !== 'ALL') params.set('subDivision', subDivisionFilter);
        if (majorCategoryFilter) params.set('majorCategory', majorCategoryFilter);
        if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
        if (searchText) params.set('search', searchText);
        if (dateRangeFilter?.[0]) params.set('startDate', dateRangeFilter[0].startOf('day').toISOString());
        if (dateRangeFilter?.[1]) params.set('endDate', dateRangeFilter[1].endOf('day').toISOString());
        if (pathType) params.set('pathType', pathType);

        const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to fetch items');
        const result = await response.json();
        const withMcCode = (result.data || []).map((item: ApproverItem) => ({
          ...item,
          mcCode: item.mcCode || inferMcCode(item.majorCategory),
        }));
        setItems(withMcCode);
        setTotalCount(result.meta?.total || 0);
        // Reset single-article cursor whenever a new page lands
        setCurrentIndex(0);
      } catch {
        message.error('Failed to load items');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, divisionFilter, subDivisionFilter, majorCategoryFilter, sourceFilter, searchText, dateRangeFilter, pathType],
  );

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  useEffect(() => {
    if (pathType === 'created') setStatusFilter('APPROVED');
  }, [pathType]);

  useEffect(() => {
    if (editingItem?.division) preloadAttributeValues(editingItem.division).catch(() => {});
  }, [editingItem?.division]);

  useEffect(() => {
    fetchItems(1);
  }, [fetchItems]);

  const buildApproverExportData = useCallback((rows: ApproverItem[]) => {
    return rows.map((row) => {
      const createdAt = row.createdAt ? new Date(row.createdAt) : null;
      const formattedDate = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString('en-GB') : '';
      return {
        'Article Number': row.articleNumber || row.imageName || '',
        Division: row.division || '',
        'Sub Division': row.subDivision || '',
        'Major Category': row.majorCategory || '',
        Status: row.approvalStatus || '',
        'Vendor Name': row.vendorName || '',
        'Vendor Code': row.vendorCode || '',
        'Design Number': row.designNumber || '',
        'PPT Number': row.pptNumber || '',
        Rate: row.rate == null ? undefined : Number(row.rate),
        MRP: row.mrp == null ? undefined : Number(row.mrp),
        Size: row.size || '',
        Pattern: row.pattern || '',
        Fit: row.fit || '',
        Wash: row.wash || '',
        'Macro MVGR': row.macroMvgr || '',
        'Main MVGR': row.mainMvgr || '',
        'Yarn 1': row.yarn1 || '',
        'Fabric Main MVGR': row.fabricMainMvgr || '',
        Weave: row.weave || '',
        'M FAB 2': row.mFab2 || '',
        Composition: row.composition || '',
        Finish: row.finish || '',
        GSM: row.gsm || '',
        Weight: row.weight || '',
        Lycra: row.lycra || '',
        Shade: row.shade || '',
        Neck: row.neck || '',
        'Neck Details': row.neckDetails || '',
        Sleeve: row.sleeve || '',
        Length: row.length || '',
        Collar: row.collar || '',
        Placket: row.placket || '',
        'Bottom Fold': row.bottomFold || '',
        'Front Open Style': row.frontOpenStyle || '',
        'Pocket Type': row.pocketType || '',
        Drawcord: row.drawcord || '',
        Button: row.button || '',
        Zipper: row.zipper || '',
        'Zip Colour': row.zipColour || '',
        'Father Belt': row.fatherBelt || '',
        'Child Belt': row.childBelt || '',
        'Print Type': row.printType || '',
        'Print Style': row.printStyle || '',
        'Print Placement': row.printPlacement || '',
        Patches: row.patches || '',
        'Patches Type': row.patchesType || '',
        Embroidery: row.embroidery || '',
        'Embroidery Type': row.embroideryType || '',
        'Reference Article Number': row.referenceArticleNumber || '',
        'Reference Article Description': row.referenceArticleDescription || '',
        'MC Code': row.mcCode || '',
        Segment: row.segment || '',
        Season: row.season || '',
        'HSN Tax Code': row.hsnTaxCode || '',
        'Article Description': row.articleDescription || '',
        'Fashion Grid': row.fashionGrid || '',
        Year: row.year || '',
        'Article Type': row.articleType || '',
        'Extracted By': row.userName || '',
        'Created Date': formattedDate,
      } as Record<(typeof SIMPLE_APPROVER_EXPORT_HEADERS)[number], string | number | undefined>;
    });
  }, []);

  const handleExportSelected = useCallback(async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Select at least one article to export');
      return;
    }
    const selectedItems = items.filter((item) => selectedRowKeys.includes(item.id));
    if (selectedItems.length === 0) {
      message.warning('No selected articles available to export');
      return;
    }
    const exportData = buildApproverExportData(selectedItems);
    await exportToExcel(exportData, [...SIMPLE_APPROVER_EXPORT_HEADERS], [], 'Article Creation');
  }, [buildApproverExportData, items, selectedRowKeys]);

  const [exportingAll, setExportingAll] = useState(false);

  const handleExportAll = useCallback(async () => {
    setExportingAll(true);
    message.loading('Fetching all records for export…');
    try {
      const token = localStorage.getItem('authToken');
      const params = new URLSearchParams();
      const effectiveStatus =
        pathType === 'new' ? 'PENDING' : pathType === 'rejected' ? 'REJECTED' : pathType === 'created' ? 'APPROVED' : statusFilter;
      params.set('status', effectiveStatus);
      if (divisionFilter !== 'ALL') params.set('division', divisionFilter);
      if (subDivisionFilter !== 'ALL') params.set('subDivision', subDivisionFilter);
      if (majorCategoryFilter) params.set('majorCategory', majorCategoryFilter);
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
      if (searchText) params.set('search', searchText);
      if (dateRangeFilter?.[0]) params.set('startDate', dateRangeFilter[0].startOf('day').toISOString());
      if (dateRangeFilter?.[1]) params.set('endDate', dateRangeFilter[1].endOf('day').toISOString());
      if (pathType) params.set('pathType', pathType);

      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/export-all?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const result = await response.json();
      const allRows = (result.data || []).map((item: ApproverItem) => ({
        ...item,
        mcCode: item.mcCode || inferMcCode(item.majorCategory),
      }));
      if (allRows.length === 0) {
        message.warning('No records found for the current filters');
        return;
      }
      const exportData = buildApproverExportData(allRows);
      const fileName =
        pathType === 'old' ? 'Old Articles' : pathType === 'new' ? 'New Articles' : pathType === 'rejected' ? 'Rejected Articles' : 'Articles';
      const divLabel = divisionFilter !== 'ALL' ? ` - ${divisionFilter}` : '';
      await exportToExcel(exportData, [...SIMPLE_APPROVER_EXPORT_HEADERS], [], `${fileName}${divLabel}`);
      message.success(`Exported ${allRows.length} records`);
    } catch {
      message.error('Export failed. Please try again.');
    } finally {
      setExportingAll(false);
    }
  }, [statusFilter, divisionFilter, subDivisionFilter, majorCategoryFilter, sourceFilter, searchText, dateRangeFilter, pathType, buildApproverExportData]);

  // ─── Single-article navigation ──────────────────────────────────────────────
  // Global position across all server pages, plus crossing pages on prev/next.
  const currentItem = items[currentIndex] ?? null;
  const globalPosition = items.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + currentIndex + 1;

  // Auto-select current article for Save & Submit / Reject ergonomics
  useEffect(() => {
    if (currentItem && currentItem.approvalStatus !== 'REJECTED') {
      setSelectedRowKeys([currentItem.id]);
    } else {
      setSelectedRowKeys([]);
    }
  }, [currentItem?.id]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      return;
    }
    if (currentPage > 1) {
      // Cross to previous page; the post-fetch effect resets index to 0 — we
      // need to land on the LAST item of the previous page, so adjust after.
      const prevPage = currentPage - 1;
      fetchItems(prevPage).then(() => setCurrentIndex(PAGE_SIZE - 1));
    }
  }, [currentIndex, currentPage, fetchItems]);

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    // Cross to next page if there's more data
    if (currentPage * PAGE_SIZE < totalCount) {
      fetchItems(currentPage + 1);
    }
  }, [currentIndex, items.length, currentPage, totalCount, fetchItems]);

  const isFirstArticle = currentPage === 1 && currentIndex === 0;
  const isLastArticle = currentPage * PAGE_SIZE >= totalCount && currentIndex >= items.length - 1;

  const pendingSelectedKeys = useMemo(
    () => selectedRowKeys.filter((key) => items.find((item) => item.id === key)?.approvalStatus === 'PENDING'),
    [selectedRowKeys, items],
  );

  const approveBlockedReasons = useMemo(() => {
    const pendingItems = items.filter((i) => pendingSelectedKeys.includes(i.id));
    const errors: { articleId: string; missing: string[] }[] = [];
    for (const item of pendingItems) {
      const missing: string[] = [];
      const majCat = normalizeMajorCategory(item.majorCategory || '', item.division || '');
      const mandatoryKeys = getMajCatMandatoryKeys(majCat);
      for (const [field, schemaKey] of Object.entries(FIELD_TO_SCHEMA_KEY)) {
        const hasValues = getMajCatAllowedValues(item.division || '', schemaKey) !== null;
        if (hasValues && mandatoryKeys.has(schemaKey) && !(item as any)[field]) {
          missing.push(SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey] || schemaKey);
        }
      }
      if (!item.mrp || Number(item.mrp) === 0) missing.push('MRP');
      if (!(item as any).impAtrbt2) missing.push('IMP_ATRBT-2');
      if (!item.vendorCode) missing.push('VENDOR CODE');
      if (missing.length > 0) {
        errors.push({
          articleId: item.sapArticleId || item.articleNumber || item.imageName || item.id,
          missing,
        });
      }
    }
    return errors;
  }, [pendingSelectedKeys, items]);

  const handleApproveClick = () => {
    if (pendingSelectedKeys.length === 0) return;
    if (approveBlockedReasons.length > 0) {
      setInfoDialog({ kind: 'mandatoryMissing', errors: approveBlockedReasons });
      return;
    }
    setConfirmDialog({ kind: 'approve', count: pendingSelectedKeys.length });
  };

  const doApprove = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: pendingSelectedKeys }),
      });
      if (!response.ok) throw new Error('Approval failed');
      const payload = await response.json();
      if (payload?.sapSync) {
        const { synced, failed, failures } = payload.sapSync;
        if (failed === 0) {
          message.success(`Approved ${payload.count}. SAP sync: ${synced} synced successfully.`);
        } else if (synced === 0) {
          setInfoDialog({ kind: 'sapSyncFailed', failures: failures || [], total: failed });
        } else {
          message.warning(`Approved ${synced} articles. ${failed} failed SAP sync.`);
          if (failures && failures.length > 0) {
            setInfoDialog({ kind: 'sapPartialFailed', failures, total: failed });
          }
        }
      } else {
        message.success('Items approved successfully');
      }
      setSelectedRowKeys([]);
      fetchItems(1);
    } catch {
      message.error('Failed to approve items');
    }
  };

  const doReject = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: pendingSelectedKeys }),
      });
      if (!response.ok) throw new Error('Rejection failed');
      message.success('Items rejected');
      setSelectedRowKeys([]);
      fetchItems(1);
    } catch {
      message.error('Failed to reject items');
    }
  };

  const handleCreateFabricArticle = (item: ApproverItem) => setConfirmDialog({ kind: 'createFabric', item });
  const handleCreateBodyArticle = (item: ApproverItem) => setConfirmDialog({ kind: 'createBody', item });
  const handleProceedFGArticle = (item: ApproverItem) => setConfirmDialog({ kind: 'proceedFG', item });

  const doCreateFabric = async (item: ApproverItem) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/create-fabric-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [item.id] }),
      });
      if (!response.ok) throw new Error('Request failed');
      message.success('Fabric article creation initiated');
      fetchItems(currentPage);
    } catch {
      message.error('Failed to create fabric article');
    }
  };

  const doCreateBody = async (item: ApproverItem) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/create-body-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [item.id] }),
      });
      if (!response.ok) throw new Error('Request failed');
      message.success('Body article creation initiated');
      fetchItems(currentPage);
    } catch {
      message.error('Failed to create body article');
    }
  };

  const doProceedFG = async (item: ApproverItem) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/proceed-fg-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [item.id] }),
      });
      if (!response.ok) throw new Error('Request failed');
      message.success('FG article creation initiated');
      fetchItems(currentPage);
    } catch {
      message.error('Failed to proceed with FG article creation');
    }
  };

  const handleEdit = (item: ApproverItem) => {
    setEditingItem(item);
    editForm.reset({
      articleNumber: item.articleNumber ?? '',
      division: item.division ?? '',
      subDivision: item.subDivision ?? '',
      majorCategory: item.majorCategory ?? '',
      vendorName: item.vendorName ?? '',
      designNumber: item.designNumber ?? '',
      pptNumber: item.pptNumber ?? '',
      referenceArticleNumber: item.referenceArticleNumber ?? '',
      referenceArticleDescription: item.referenceArticleDescription ?? '',
      rate: item.rate ?? '',
      size: item.size ?? '',
      fabricMainMvgr: item.fabricMainMvgr ?? '',
      composition: item.composition ?? '',
      weave: item.weave ?? '',
      macroMvgr: item.macroMvgr ?? '',
      mainMvgr: item.mainMvgr ?? '',
      mFab2: item.mFab2 ?? '',
      fabDiv: item.fabDiv ?? '',
      gsm: item.gsm ?? '',
      finish: item.finish ?? '',
      shade: item.shade ?? '',
      weight: item.weight ?? '',
      lycra: item.lycra ?? '',
      yarn1: item.yarn1 ?? '',
      colour: item.colour ?? '',
      pattern: item.pattern ?? '',
      fit: item.fit ?? '',
      neck: item.neck ?? '',
      sleeve: item.sleeve ?? '',
      length: item.length ?? '',
      collar: item.collar ?? '',
      placket: item.placket ?? '',
      bottomFold: item.bottomFold ?? '',
      frontOpenStyle: item.frontOpenStyle ?? '',
      pocketType: item.pocketType ?? '',
      drawcord: item.drawcord ?? '',
      button: item.button ?? '',
      zipper: item.zipper ?? '',
      zipColour: item.zipColour ?? '',
      fatherBelt: item.fatherBelt ?? '',
      childBelt: item.childBelt ?? '',
      printType: item.printType ?? '',
      printStyle: item.printStyle ?? '',
      printPlacement: item.printPlacement ?? '',
      patches: item.patches ?? '',
      patchesType: item.patchesType ?? '',
      embroidery: item.embroidery ?? '',
      embroideryType: item.embroideryType ?? '',
      wash: item.wash ?? '',
      neckDetails: item.neckDetails ?? '',
      vendorCode: item.vendorCode ?? '',
      mrp: item.mrp ?? '',
      mcCode: item.mcCode || inferMcCode(item.majorCategory) || '',
      segment: item.segment ?? '',
      season: item.season ?? '',
      hsnTaxCode: item.hsnTaxCode ?? '',
      articleDescription: item.articleDescription ?? '',
      fashionGrid: item.fashionGrid ?? '',
      year: item.year ?? '',
      articleType: item.articleType ?? '',
    });
    setModalMarkdown(calcMarkdown(item.mrp, item.rate));
    setEditActiveTab('core');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (values: Record<string, any>) => {
    try {
      const token = localStorage.getItem('authToken');
      if (values.majorCategory && (values.majorCategory !== editingItem?.majorCategory || !values.mcCode)) {
        values.mcCode = inferMcCode(values.majorCategory) || values.mcCode;
      }
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${editingItem?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        let errorText = 'Failed to update item';
        try {
          const payload = await response.json();
          if (payload?.error) errorText = payload.error;
        } catch {
          /* fallback */
        }
        throw new Error(errorText);
      }
      message.success('Item updated');
      setIsEditModalOpen(false);
      setEditingItem(null);
      fetchItems(currentPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to update item');
    }
  };

  const getSubDivisionOptions = (division: string | undefined): string[] => {
    if (!division) return [];
    if (division.match(/LADIES|WOMEN/i)) return SIMPLIFIED_HIERARCHY['Ladies'];
    if (division.match(/KIDS/i)) return SIMPLIFIED_HIERARCHY['Kids'];
    if (division.match(/MEN/i)) return SIMPLIFIED_HIERARCHY['MENS'];
    return [];
  };

  const renderTextField = (name: string, label: string) => (
    <FormField
      control={editForm.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} />
          </FormControl>
        </FormItem>
      )}
    />
  );

  const coreTab = (
    <div className="grid grid-cols-2 gap-4">
      {renderTextField('articleNumber', 'Article Number')}
      {renderTextField('designNumber', 'Design Number')}
      {renderTextField('majorCategory', 'Major Category')}
      <FormField
        control={editForm.control}
        name="division"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Division</FormLabel>
            <FormControl>
              <Select
                value={field.value || ''}
                onValueChange={(v) => {
                  field.onChange(v);
                  editForm.setValue('subDivision', '');
                }}
                disabled={(user?.role === 'APPROVER' || user?.role === 'CATEGORY_HEAD') && !!user?.division}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEN">MENS</SelectItem>
                  <SelectItem value="LADIES">LADIES</SelectItem>
                  <SelectItem value="KIDS">KIDS</SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={editForm.control}
        name="subDivision"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sub-Division</FormLabel>
            <FormControl>
              <Select
                value={field.value || ''}
                onValueChange={field.onChange}
                disabled={user?.role === 'APPROVER' && !!user?.subDivision}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-division" />
                </SelectTrigger>
                <SelectContent>
                  {getSubDivisionOptions(modalDivision).map((sd) => (
                    <SelectItem key={sd} value={sd}>
                      {sd}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
          </FormItem>
        )}
      />
      {renderTextField('vendorName', 'Vendor Name')}
      {renderTextField('pptNumber', 'PPT Number')}
      {renderTextField('referenceArticleNumber', 'Ref. Article #')}
      {renderTextField('referenceArticleDescription', 'Ref. Description')}
      <FormField
        control={editForm.control}
        name="rate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Rate</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setModalMarkdown(calcMarkdown(editForm.getValues('mrp'), e.target.value));
                }}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={editForm.control}
        name="mrp"
        render={({ field }) => (
          <FormItem>
            <FormLabel>MRP</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="e.g. 599"
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setModalMarkdown(calcMarkdown(e.target.value, editForm.getValues('rate')));
                }}
              />
            </FormControl>
          </FormItem>
        )}
      />
      {modalMarkdown !== null && (
        <div className="col-span-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[13px]">
          <span className="text-muted-foreground">Markdown: </span>
          <span className="font-bold text-blue-600">{modalMarkdown}</span>
          <span className="ml-2 text-xs text-muted-foreground">(MRP − Rate) ÷ MRP × 100</span>
        </div>
      )}
      {renderTextField('size', 'Size')}
    </div>
  );

  const attributesTab = (() => {
    const division = editingItem?.division || '';
    const majorCat = normalizeMajorCategory(editingItem?.majorCategory || '', division);
    const mandatoryKeys = getMajCatMandatoryKeys(majorCat);

    const visibleFields = ATTRIBUTE_FIELDS.filter((field) => {
      if (!majorCat) return true;
      const currentValue = editingItem?.[field.formName as keyof typeof editingItem];
      if (currentValue) return true;
      if (!mandatoryKeys.has(field.schemaKey)) return false;
      const values = getMajCatAllowedValues(division, field.schemaKey);
      return values !== null;
    });

    if (visibleFields.length === 0) {
      return <div className="p-6 text-center text-muted-foreground">No attributes defined for this major category.</div>;
    }

    return (
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <table className="w-full border-collapse">
          <tbody>
            {visibleFields.map((field) => {
              const values = division ? getMajCatAllowedValues(division, field.schemaKey) : null;
              const isMandatory = mandatoryKeys.has(field.schemaKey);
              return (
                <tr key={field.formName} className="border-b border-border">
                  <td
                    className="w-[180px] whitespace-nowrap py-1.5 pr-3 align-middle text-[13px]"
                    style={{ fontWeight: isMandatory ? 600 : 400, color: isMandatory ? '#1f1f1f' : '#595959' }}
                  >
                    {isMandatory && <span className="mr-1 text-red-500">*</span>}
                    {field.label}
                  </td>
                  <td className="py-1">
                    <FormField
                      control={editForm.control}
                      name={field.formName}
                      render={({ field: f }) =>
                        values ? (
                          <Select value={f.value || ''} onValueChange={f.onChange}>
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {values.map((v) => (
                                <SelectItem key={v.shortForm} value={v.shortForm}>
                                  {v.shortForm}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input {...f} value={f.value ?? ''} placeholder="Enter value..." className="h-8" />
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  })();

  const businessTab = (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-3">
        <h5 className="text-base font-semibold">Business & SAP Fields</h5>
      </div>
      {renderTextField('vendorCode', 'Vendor Code')}
      {renderTextField('mcCode', 'MC Code')}
      {renderTextField('segment', 'Segment')}
      {renderTextField('season', 'Season')}
      {renderTextField('hsnTaxCode', 'HSN Tax Code')}
      {renderTextField('fashionGrid', 'Fashion Grid')}
      {renderTextField('year', 'Year')}
      {renderTextField('articleType', 'Article Type')}
      <FormField
        control={editForm.control}
        name="articleDescription"
        render={({ field }) => (
          <FormItem className="col-span-3">
            <FormLabel>Article Description</FormLabel>
            <FormControl>
              <Textarea rows={3} {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );

  return (
    <div>
      <div className="sticky top-0 z-40 mb-3 shrink-0">
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          {/* ─── Brand strip — slate gradient with title + prev/next + page actions ─── */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-white"
            style={{ background: 'linear-gradient(90deg, #1f2937 0%, #334155 100%)' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              {/* Logo chip */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF6F61]/90">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold leading-tight">
                  {pathType === 'old'
                    ? 'Old Articles'
                    : pathType === 'new'
                    ? 'New Articles'
                    : pathType === 'rejected'
                    ? 'Rejected Articles'
                    : pathType === 'created'
                    ? 'Created Articles'
                    : 'Approver Dashboard'}
                </div>
                <div className="truncate text-[11px] text-white/70">
                  {user?.division && (
                    <span className="font-medium">
                      {formatDivisionLabel(user.division)}
                      {user.subDivision ? ` · ${user.subDivision}` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Prev/Next + position indicator */}
              {totalCount > 0 && (
                <div className="ml-2 flex items-center gap-1 rounded-md bg-white/10 px-1 py-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={goPrev}
                    disabled={isFirstArticle}
                    className="h-7 px-2 text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="px-1 text-[12px] font-medium tabular-nums">
                    {globalPosition} / {totalCount}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={goNext}
                    disabled={isLastArticle}
                    className="h-7 px-2 text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </div>

            {/* Page-level action buttons */}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchItems(currentPage)}
                className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <RotateCw />
                Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportAll}
                disabled={exportingAll}
                className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white disabled:opacity-50"
              >
                <Download />
                Export ({totalCount})
              </Button>
              <Tooltip title={!canApprove ? 'Only Approver, Sub-Division Head, Category Head or Admin can reject articles' : ''}>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (pendingSelectedKeys.length > 0) setConfirmDialog({ kind: 'reject', count: pendingSelectedKeys.length });
                  }}
                  disabled={!canApprove || pendingSelectedKeys.length === 0}
                  className="h-8"
                >
                  <XCircle />
                  Reject
                </Button>
              </Tooltip>
              <Tooltip
                side="bottom"
                title={
                  !canApprove
                    ? 'Only Approver, Sub-Division Head, Category Head or Admin can approve articles'
                    : approveBlockedReasons.length > 0
                    ? (
                        <div className="text-xs leading-relaxed">
                          <div className="mb-1.5 text-[13px] font-bold text-red-700">⚠ Fill required fields first:</div>
                          {approveBlockedReasons.slice(0, 5).map(({ articleId, missing }) => (
                            <div key={articleId} className="mb-1.5 rounded border border-red-300 bg-red-50 px-2 py-1">
                              <span className="font-semibold text-amber-700">{articleId}: </span>
                              <span className="text-red-700">{missing.join(', ')}</span>
                            </div>
                          ))}
                          {approveBlockedReasons.length > 5 && (
                            <div className="text-muted-foreground">...and {approveBlockedReasons.length - 5} more articles</div>
                          )}
                        </div>
                      )
                    : ''
                }
              >
                <Button
                  size="sm"
                  onClick={handleApproveClick}
                  disabled={!canApprove || pendingSelectedKeys.length === 0 || approveBlockedReasons.length > 0}
                  className="h-8 border-none bg-[#FF6F61] font-semibold text-white shadow-sm hover:bg-[#ff5b4d] disabled:bg-white/20 disabled:text-white/50"
                >
                  <CheckCircle2 />
                  Save &amp; Submit
                  {approveBlockedReasons.length > 0 && (
                    <span className="ml-1 text-[10px] text-amber-200">⚠ {approveBlockedReasons.length}</span>
                  )}
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* ─── Filter row (compact) ─── */}
          <div className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                placeholder="Search article, vendor, design, PPT no..."
                onChange={handleSearchChange}
                allowClear
                onClear={() => setSearchText('')}
                className="w-full sm:w-[260px]"
              />
              {pathType !== 'rejected' && pathType !== 'created' && pathType !== 'new' && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(showDivisionFilter || user?.role === 'ADMIN') && (
                <Select
                  value={divisionFilter}
                  onValueChange={(val) => {
                    setDivisionFilter(val);
                    setSubDivisionFilter('ALL');
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Division" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Divisions</SelectItem>
                    {user?.role === 'ADMIN' ? (
                      <>
                        <SelectItem value="MEN">MENS</SelectItem>
                        <SelectItem value="LADIES">LADIES</SelectItem>
                        <SelectItem value="KIDS">KIDS</SelectItem>
                      </>
                    ) : (
                      userAssignedDivisions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {formatDivisionLabel(d)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {(showSubDivisionFilter || user?.role === 'ADMIN') && (
                <Select
                  value={subDivisionFilter}
                  onValueChange={(val) => {
                    setSubDivisionFilter(val);
                    setMajorCategoryFilter('');
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sub-Division" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Sub-Divs</SelectItem>
                    {user?.role === 'ADMIN'
                      ? (getSubDivisionOptions(divisionFilter === 'ALL' ? undefined : divisionFilter).length > 0
                          ? getSubDivisionOptions(divisionFilter === 'ALL' ? undefined : divisionFilter)
                          : [
                              ...SIMPLIFIED_HIERARCHY['MENS'],
                              ...SIMPLIFIED_HIERARCHY['Ladies'],
                              ...SIMPLIFIED_HIERARCHY['Kids'],
                            ]
                        ).map((sd) => (
                          <SelectItem key={sd} value={sd}>
                            {sd}
                          </SelectItem>
                        ))
                      : userAssignedSubDivisions.map((sd) => (
                          <SelectItem key={sd} value={sd}>
                            {sd}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={majorCategoryFilter || '__all__'} onValueChange={(v) => setMajorCategoryFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Major Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Major Categories</SelectItem>
                  {(() => {
                    const div = divisionFilter === 'ALL' ? '' : divisionFilter;
                    let prefixRegex: RegExp | null = null;
                    if (div.match(/MEN/i)) prefixRegex = /^M|^MW/i;
                    else if (div.match(/LADIES|WOMEN/i)) prefixRegex = /^L|^LW/i;
                    else if (div.match(/KIDS/i)) prefixRegex = /^(K|I|J|Y|G)/i;
                    return MAJOR_CATEGORY_ALLOWED_VALUES.filter((v) => !prefixRegex || v.shortForm.match(prefixRegex)).map(
                      (v) => (
                        <SelectItem key={v.shortForm} value={v.shortForm}>
                          {v.shortForm}
                        </SelectItem>
                      ),
                    );
                  })()}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sources</SelectItem>
                  <SelectItem value="SRM">SRM</SelectItem>
                  <SelectItem value="WATCHER">Watcher</SelectItem>
                  <SelectItem value="USER">User</SelectItem>
                </SelectContent>
              </Select>
              <RangePicker value={dateRangeFilter} onChange={setDateRangeFilter} placeholder={['Start date', 'End date']} />
            </div>
          </div>

        </div>
      </div>

      <div className="mt-1.5">
        <ApproverArticleList
          items={currentItem ? [currentItem] : []}
          majorCategory={majorCategoryFilter}
          loading={loading}
          selectedRowKeys={selectedRowKeys}
          onSelectionChange={setSelectedRowKeys}
          onEdit={handleEdit}
          onCreateFabricArticle={handleCreateFabricArticle}
          onCreateBodyArticle={handleCreateBodyArticle}
          onProceedFGArticle={handleProceedFGArticle}
          onDuplicate={async () => {
            /* handled inside ApproverArticleList */
          }}
          attributes={attributes}
          onRefresh={() => fetchItems(currentPage)}
          pathType={pathType}
          serverPagination={{
            total: totalCount,
            current: currentPage,
            pageSize: PAGE_SIZE,
            onChange: (page) => {
              setSelectedRowKeys([]);
              fetchItems(page);
            },
          }}
          onSave={async (row, directUpdates) => {
            const newData = [...items];
            const index = newData.findIndex((item) => item.id === row.id);
            let updatePayload: Record<string, unknown> = {};
            if (index > -1) {
              const item = newData[index];
              updatePayload = Object.fromEntries(
                Object.entries(directUpdates || {}).map(([key, value]) => [key, value === undefined ? null : value]),
              );
              if (Object.keys(updatePayload).length === 0) {
                updatePayload = Object.fromEntries(
                  Object.entries(row)
                    .filter(([key, value]) => (item as any)[key] !== value)
                    .map(([key, value]) => [key, value === undefined ? null : value]),
                );
              }
              if (updatePayload.majorCategory && !updatePayload.mcCode) {
                updatePayload.mcCode = inferMcCode(updatePayload.majorCategory as string) || undefined;
              }
              newData.splice(index, 1, { ...item, ...updatePayload });
              setItems(newData);
            }
            if (Object.keys(updatePayload).length === 0) return;
            try {
              const token = localStorage.getItem('authToken');
              const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${row.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(updatePayload),
              });
              if (!response.ok) {
                const errText = await response.text();
                console.error('[onSave] Save failed:', response.status, errText);
                throw new Error('Update failed');
              }
              const saved = await response.json();
              setItems((prev) => {
                const idx = prev.findIndex((i) => i.id === saved.id);
                if (idx === -1) return prev;
                const copy = [...prev];
                copy[idx] = {
                  ...copy[idx],
                  ...saved,
                  mcCode: saved.mcCode || inferMcCode(saved.majorCategory) || copy[idx].mcCode || '',
                };
                return copy;
              });
              message.success('Saved');
            } catch {
              message.error('Failed to save');
              fetchItems(currentPage);
            }
          }}
        />
      </div>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-h-[90vh] w-[1000px] max-w-[1000px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Article Details</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleSaveEdit)}>
              <Tabs value={editActiveTab} onValueChange={(v) => setEditActiveTab(v as typeof editActiveTab)}>
                <TabsList>
                  <TabsTrigger value="core">Core Details</TabsTrigger>
                  <TabsTrigger value="attributes">Attributes</TabsTrigger>
                  <TabsTrigger value="business">Business & SAP</TabsTrigger>
                </TabsList>
                <TabsContent value="core">{coreTab}</TabsContent>
                <TabsContent value="attributes">{attributesTab}</TabsContent>
                <TabsContent value="business">{businessTab}</TabsContent>
              </Tabs>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent>
          {confirmDialog?.kind === 'approve' && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm Approval</DialogTitle>
              </DialogHeader>
              <p className="m-0">
                Are you sure you want to approve {confirmDialog.count} items? This action cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    setConfirmDialog(null);
                    await doApprove();
                  }}
                >
                  Approve
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmDialog?.kind === 'reject' && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm Rejection</DialogTitle>
              </DialogHeader>
              <p className="m-0">Are you sure you want to reject {confirmDialog.count} items?</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    setConfirmDialog(null);
                    await doReject();
                  }}
                >
                  Reject
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmDialog?.kind === 'createFabric' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-sky-500" />
                  Create Fabric Article
                </DialogTitle>
              </DialogHeader>
              <p className="m-0">
                Create fabric article for "{confirmDialog.item.articleNumber || confirmDialog.item.imageName || confirmDialog.item.id}"?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const item = confirmDialog.item;
                    setConfirmDialog(null);
                    await doCreateFabric(item);
                  }}
                >
                  Create Fabric Article
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmDialog?.kind === 'createBody' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-purple-500" />
                  Create Body Article
                </DialogTitle>
              </DialogHeader>
              <p className="m-0">
                Create body article for "{confirmDialog.item.articleNumber || confirmDialog.item.imageName || confirmDialog.item.id}"?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const item = confirmDialog.item;
                    setConfirmDialog(null);
                    await doCreateBody(item);
                  }}
                >
                  Create Body Article
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmDialog?.kind === 'proceedFG' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-amber-500" />
                  Proceed for FG Article Creation
                </DialogTitle>
              </DialogHeader>
              <p className="m-0">
                Proceed with FG article creation for "{confirmDialog.item.articleNumber || confirmDialog.item.imageName || confirmDialog.item.id}"?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const item = confirmDialog.item;
                    setConfirmDialog(null);
                    await doProceedFG(item);
                  }}
                >
                  Proceed
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Info dialog */}
      <Dialog open={!!infoDialog} onOpenChange={(o) => !o && setInfoDialog(null)}>
        <DialogContent className="max-w-[600px]">
          {infoDialog?.kind === 'mandatoryMissing' && (
            <>
              <DialogHeader>
                <DialogTitle>Cannot Approve — Mandatory Fields Missing</DialogTitle>
              </DialogHeader>
              <div className="max-h-[400px] overflow-y-auto">
                {infoDialog.errors.map(({ articleId, missing }) => (
                  <div key={articleId} className="mb-3">
                    <div className="mb-1 text-[13px] font-semibold">{articleId}</div>
                    <div className="flex flex-wrap gap-1">
                      {missing.map((f) => (
                        <span key={f} className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => setInfoDialog(null)}>OK</Button>
              </DialogFooter>
            </>
          )}
          {infoDialog?.kind === 'sapSyncFailed' && (
            <>
              <DialogHeader>
                <DialogTitle>SAP Sync Failed ({infoDialog.total} article{infoDialog.total > 1 ? 's' : ''})</DialogTitle>
              </DialogHeader>
              <div className="max-h-[300px] overflow-y-auto">
                {infoDialog.failures.length > 0 ? (
                  infoDialog.failures.map((failItem, i) => (
                    <div key={i} className="mb-2 rounded bg-red-50 px-2 py-1.5 text-[13px] text-red-700">
                      {failItem.message}
                    </div>
                  ))
                ) : (
                  <div className="rounded bg-red-50 px-2 py-1.5 text-[13px] text-red-700">
                    SAP rejected the article. Check the ⚠ SAP Error banner on the article card below for the exact reason.
                  </div>
                )}
                <div className="mt-3 text-xs text-muted-foreground">
                  Please fix the highlighted field{infoDialog.total > 1 ? 's' : ''} and try approving again.
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setInfoDialog(null)}>OK</Button>
              </DialogFooter>
            </>
          )}
          {infoDialog?.kind === 'sapPartialFailed' && (
            <>
              <DialogHeader>
                <DialogTitle>{infoDialog.total} Article{infoDialog.total > 1 ? 's' : ''} Failed SAP Sync</DialogTitle>
              </DialogHeader>
              <div className="max-h-[300px] overflow-y-auto">
                {infoDialog.failures.map((failItem, i) => (
                  <div key={i} className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-[13px] text-amber-700">
                    {failItem.message}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => setInfoDialog(null)}>OK</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
