import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, Button, Typography, App, Modal, Form, Input, Select, Row, Col, Tabs, DatePicker, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, DownloadOutlined, FileTextOutlined, AppstoreAddOutlined, RocketOutlined } from '@ant-design/icons';
// FileTextOutlined, AppstoreAddOutlined, RocketOutlined used in per-article modal icons
import { ApproverTable } from '../components/ApproverTable';
import type { ApproverItem, MasterAttribute } from '../components/ApproverTable';
import { ApproverArticleList } from '../components/ApproverArticleList';
import VariantSubTable from '../components/VariantSubTable';
import { APP_CONFIG } from '../../../constants/app/config';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
import { getMcCodeByMajorCategory, MAJOR_CATEGORY_ALLOWED_VALUES } from '../../../data/majorCategoryMcCodeMap';
import { getMajCatAllowedValues, getMajCatMandatoryKeys, SCHEMA_KEY_TO_EXCEL_ATTR, normalizeMajorCategory } from '../../../data/majCatAttributeMap';
import { preloadAttributeValues } from '../../../services/articleConfigService';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
import type { Dayjs } from 'dayjs';
import { exportToExcel } from '../../../shared/utils/export/extractionExport';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const inferMcCode = (majorCategory?: string | null): string | null =>
    getMcCodeByMajorCategory(majorCategory);

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
    return ((m - r) / m * 100).toFixed(1) + '%';
};

const normalizeText = (value?: string | null): string =>
    String(value || '').trim().toUpperCase();

const getDivisionVariants = (value?: string | null): string[] => {
    const normalized = normalizeText(value);
    if (!normalized) return [];

    if (normalized === 'MEN' || normalized === 'MENS') return ['MEN', 'MENS'];
    if (normalized === 'LADIES' || normalized === 'WOMEN' || normalized === 'WOMAN') return ['LADIES', 'WOMEN'];
    if (normalized === 'KID' || normalized === 'KIDS') return ['KID', 'KIDS'];

    return [normalized];
};

const getSubDivisionVariants = (value?: string | null): string[] =>
    Array.from(new Set(
        String(value || '')
            .split(/[;,|]+/)
            .map((item) => normalizeText(item))
            .filter(Boolean)
    ));

export const SIMPLE_APPROVER_EXPORT_HEADERS = [
    'Article Number',
    'Division',
    'Sub Division',
    'Major Category',
    'Status',
    'Vendor Name',
    'Vendor Code',
    'Design Number',
    'PPT Number',
    'Rate',
    'MRP',
    'Size',
    'Pattern',
    'Fit',
    'Wash',
    'Macro MVGR',
    'Main MVGR',
    'Yarn 1',
    'Fabric Main MVGR',
    'Weave',
    'M FAB 2',
    'Composition',
    'Finish',
    'GSM',
    'Weight',
    'Lycra',
    'Shade',
    'Neck',
    'Neck Details',
    'Sleeve',
    'Length',
    'Collar',
    'Placket',
    'Bottom Fold',
    'Front Open Style',
    'Pocket Type',
    'Drawcord',
    'Button',
    'Zipper',
    'Zip Colour',
    'Father Belt',
    'Child Belt',
    'Print Type',
    'Print Style',
    'Print Placement',
    'Patches',
    'Patches Type',
    'Embroidery',
    'Embroidery Type',
    'Reference Article Number',
    'Reference Article Description',
    'MC Code',
    'Segment',
    'Season',
    'HSN Tax Code',
    'Article Description',
    'Fashion Grid',
    'Year',
    'Article Type',
    'Extracted By',
    'Created Date'
] as const;

// Complete list of attribute fields with their form name, display label, and schema key
// Schema key links to getMajCatAllowedValues / getMajCatMandatoryKeys from the Excel data
const ATTRIBUTE_FIELDS: { formName: string; label: string; schemaKey: string }[] = [
    { formName: 'macroMvgr',      label: 'Macro MVGR',        schemaKey: 'macro_mvgr' },
    { formName: 'mainMvgr',       label: 'Main MVGR',         schemaKey: 'main_mvgr' },
    { formName: 'yarn1',          label: 'Yarn 1',            schemaKey: 'yarn_01' },
    { formName: 'fabricMainMvgr', label: 'Fabric Main MVGR',  schemaKey: 'fabric_main_mvgr' },
    { formName: 'weave',          label: 'Weave',             schemaKey: 'weave' },
    { formName: 'mFab2',          label: 'M FAB 2',           schemaKey: 'm_fab2' },
    { formName: 'composition',    label: 'Composition',       schemaKey: 'composition' },
    { formName: 'finish',         label: 'Finish',            schemaKey: 'finish' },
    { formName: 'gsm',            label: 'GSM',               schemaKey: 'gsm' },
    { formName: 'weight',         label: 'G-Weight',          schemaKey: 'weight' },
    { formName: 'lycra',          label: 'Lycra / Non-Lycra', schemaKey: 'lycra_non_lycra' },
    { formName: 'shade',          label: 'Shade',             schemaKey: 'shade' },
    { formName: 'pattern',        label: 'Body Style',        schemaKey: 'body_style' },
    { formName: 'fit',            label: 'Fit',               schemaKey: 'fit' },
    { formName: 'wash',           label: 'Wash',              schemaKey: 'wash' },
    { formName: 'neck',           label: 'Neck',              schemaKey: 'neck' },
    { formName: 'neckDetails',    label: 'Neck Details',      schemaKey: 'neck_details' },
    { formName: 'collar',         label: 'Collar',            schemaKey: 'collar' },
    { formName: 'placket',        label: 'Placket',           schemaKey: 'placket' },
    { formName: 'sleeve',         label: 'Sleeve',            schemaKey: 'sleeve' },
    { formName: 'length',         label: 'Length',            schemaKey: 'length' },
    { formName: 'bottomFold',     label: 'Bottom Fold',       schemaKey: 'bottom_fold' },
    { formName: 'frontOpenStyle', label: 'Front Open Style',  schemaKey: 'front_open_style' },
    { formName: 'pocketType',     label: 'Pocket Type',       schemaKey: 'pocket_type' },
    { formName: 'drawcord',       label: 'Drawcord',          schemaKey: 'drawcord' },
    { formName: 'button',         label: 'Button',            schemaKey: 'button' },
    { formName: 'zipper',         label: 'Zipper',            schemaKey: 'zipper' },
    { formName: 'zipColour',      label: 'Zip Colour',        schemaKey: 'zip_colour' },
    { formName: 'fatherBelt',     label: 'Father Belt',       schemaKey: 'father_belt' },
    { formName: 'childBelt',      label: 'Child Belt',        schemaKey: 'child_belt' },
    { formName: 'printType',      label: 'Print Type',        schemaKey: 'print_type' },
    { formName: 'printStyle',     label: 'Print Style',       schemaKey: 'print_style' },
    { formName: 'printPlacement', label: 'Print Placement',   schemaKey: 'print_placement' },
    { formName: 'patches',        label: 'Patches',           schemaKey: 'patches' },
    { formName: 'patchesType',    label: 'Patches Type',      schemaKey: 'patches_type' },
    { formName: 'embroidery',     label: 'Embroidery',        schemaKey: 'embroidery' },
    { formName: 'embroideryType', label: 'Embroidery Type',   schemaKey: 'embroidery_type' },
];

const PAGE_SIZE = 50;

interface ApproverDashboardProps {
    pathType?: 'old' | 'new' | 'rejected' | 'created';
}

export default function ApproverDashboard({ pathType }: ApproverDashboardProps = {}) {
    const { message } = App.useApp();
    const [items, setItems] = useState<ApproverItem[]>([]);
    const [attributes, setAttributes] = useState<MasterAttribute[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [user, setUser] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchText, setSearchText] = useState('');
    const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
    const [subDivisionFilter, setSubDivisionFilter] = useState<string>('ALL');
    const [majorCategoryFilter, setMajorCategoryFilter] = useState<string>('');
    const [dateRangeFilter, setDateRangeFilter] = useState<[Dayjs | null, Dayjs | null] | null>(null);

    // Debounce search — wait 700ms idle AND require at least 3 chars (or empty to reset)
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        // Fire immediately on clear, otherwise wait 700ms and require 3+ chars
        if (value === '') {
            setSearchText('');
            return;
        }
        if (value.length < 3) return; // don't search on 1-2 chars
        searchDebounceRef.current = setTimeout(() => setSearchText(value), 700);
    }, []);

    // Derived: user's assigned divisions/sub-divisions (parsed from their profile)
    const userAssignedDivisions = useMemo(() => getDivisionVariants(user?.division), [user]);
    const userAssignedSubDivisions = useMemo(() => getSubDivisionVariants(user?.subDivision), [user]);

    // Show division filter if non-admin user has more than one division assigned
    const showDivisionFilter = user?.role !== 'ADMIN' && userAssignedDivisions.length > 1;
    // Show sub-division filter if non-admin user has more than one sub-division assigned
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

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ApproverItem | null>(null);
    const [form] = Form.useForm();
    // Track selected division in modal to cascade subDivision dropdown
    const [modalDivision, setModalDivision] = useState<string | undefined>(undefined);
    // Live markdown preview in edit modal (MRP - Rate) / MRP * 100%
    const [modalMarkdown, setModalMarkdown] = useState<string | null>(null);

    const fetchAttributes = useCallback(async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/attributes`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setAttributes(data);
            }
        } catch (error) {
            console.error('Failed to fetch attributes', error);
        }
    }, []);

    // Server-side pagination + filtering. Recreated whenever any filter changes,
    // which causes the useEffect below to re-fire and reset to page 1.
    const fetchItems = useCallback(async (page = 1) => {
        setLoading(true);
        setCurrentPage(page);
        try {
            const token = localStorage.getItem('authToken');
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(PAGE_SIZE));
            // Enforce correct status per page type — never let search return wrong-status articles
            const effectiveStatus = pathType === 'new' ? 'PENDING'
                : pathType === 'rejected' ? 'REJECTED'
                : pathType === 'created' ? 'APPROVED'
                : statusFilter;
            params.set('status', effectiveStatus);
            if (divisionFilter !== 'ALL') params.set('division', divisionFilter);
            if (subDivisionFilter !== 'ALL') params.set('subDivision', subDivisionFilter);
            if (majorCategoryFilter) params.set('majorCategory', majorCategoryFilter);
            if (searchText) params.set('search', searchText);
            if (dateRangeFilter?.[0]) params.set('startDate', dateRangeFilter[0].startOf('day').toISOString());
            if (dateRangeFilter?.[1]) params.set('endDate', dateRangeFilter[1].endOf('day').toISOString());
            if (pathType) params.set('pathType', pathType);

            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch items');

            const result = await response.json();
            const withMcCode = (result.data || []).map((item: ApproverItem) => ({
                ...item,
                mcCode: item.mcCode || inferMcCode(item.majorCategory)
            }));
            setItems(withMcCode);
            setTotalCount(result.meta?.total || 0);
        } catch (error) {
            message.error('Failed to load items');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, divisionFilter, subDivisionFilter, searchText, dateRangeFilter, pathType]);

    useEffect(() => { fetchAttributes(); }, [fetchAttributes]);

    // Lock status filter to APPROVED on the Created page
    useEffect(() => {
        if (pathType === 'created') setStatusFilter('APPROVED');
    }, [pathType]);

    // Preload DB attribute values (division-scoped) whenever editing item changes
    useEffect(() => {
        if (editingItem?.division) {
            preloadAttributeValues(editingItem.division).catch(() => {});
        }
    }, [editingItem?.division]);

    // Fires on mount and whenever fetchItems is recreated (i.e. any filter changes).
    // Always resets to page 1 so filter results start from the beginning.
    useEffect(() => { fetchItems(1); }, [fetchItems]);

    const buildApproverExportData = useCallback((rows: ApproverItem[]) => {
        return rows.map((row) => {
            const createdAt = row.createdAt ? new Date(row.createdAt) : null;
            const formattedDate = createdAt && !Number.isNaN(createdAt.getTime())
                ? createdAt.toLocaleDateString('en-GB')
                : '';

            return {
                'Article Number': row.articleNumber || row.imageName || '',
                'Division': row.division || '',
                'Sub Division': row.subDivision || '',
                'Major Category': row.majorCategory || '',
                'Status': row.approvalStatus || '',
                'Vendor Name': row.vendorName || '',
                'Vendor Code': row.vendorCode || '',
                'Design Number': row.designNumber || '',
                'PPT Number': row.pptNumber || '',
                'Rate': row.rate == null ? undefined : Number(row.rate),
                'MRP': row.mrp == null ? undefined : Number(row.mrp),
                'Size': row.size || '',
                'Pattern': row.pattern || '',
                'Fit': row.fit || '',
                'Wash': row.wash || '',
                'Macro MVGR': row.macroMvgr || '',
                'Main MVGR': row.mainMvgr || '',
                'Yarn 1': row.yarn1 || '',
                'Fabric Main MVGR': row.fabricMainMvgr || '',
                'Weave': row.weave || '',
                'M FAB 2': row.mFab2 || '',
                'Composition': row.composition || '',
                'Finish': row.finish || '',
                'GSM': row.gsm || '',
                'Weight': row.weight || '',
                'Lycra': row.lycra || '',
                'Shade': row.shade || '',
                'Neck': row.neck || '',
                'Neck Details': row.neckDetails || '',
                'Sleeve': row.sleeve || '',
                'Length': row.length || '',
                'Collar': row.collar || '',
                'Placket': row.placket || '',
                'Bottom Fold': row.bottomFold || '',
                'Front Open Style': row.frontOpenStyle || '',
                'Pocket Type': row.pocketType || '',
                'Drawcord': row.drawcord || '',
                'Button': row.button || '',
                'Zipper': row.zipper || '',
                'Zip Colour': row.zipColour || '',
                'Father Belt': row.fatherBelt || '',
                'Child Belt': row.childBelt || '',
                'Print Type': row.printType || '',
                'Print Style': row.printStyle || '',
                'Print Placement': row.printPlacement || '',
                'Patches': row.patches || '',
                'Patches Type': row.patchesType || '',
                'Embroidery': row.embroidery || '',
                'Embroidery Type': row.embroideryType || '',
                'Reference Article Number': row.referenceArticleNumber || '',
                'Reference Article Description': row.referenceArticleDescription || '',
                'MC Code': row.mcCode || '',
                'Segment': row.segment || '',
                'Season': row.season || '',
                'HSN Tax Code': row.hsnTaxCode || '',
                'Article Description': row.articleDescription || '',
                'Fashion Grid': row.fashionGrid || '',
                'Year': row.year || '',
                'Article Type': row.articleType || '',
                'Extracted By': row.userName || '',
                'Created Date': formattedDate
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
        const hide = message.loading('Fetching all records for export…', 0);
        try {
            const token = localStorage.getItem('authToken');
            const params = new URLSearchParams();
            const effectiveStatus = pathType === 'new' ? 'PENDING'
                : pathType === 'rejected' ? 'REJECTED'
                : pathType === 'created' ? 'APPROVED'
                : statusFilter;
            params.set('status', effectiveStatus);
            if (divisionFilter !== 'ALL') params.set('division', divisionFilter);
            if (subDivisionFilter !== 'ALL') params.set('subDivision', subDivisionFilter);
            if (majorCategoryFilter) params.set('majorCategory', majorCategoryFilter);
            if (searchText) params.set('search', searchText);
            if (dateRangeFilter?.[0]) params.set('startDate', dateRangeFilter[0].startOf('day').toISOString());
            if (dateRangeFilter?.[1]) params.set('endDate', dateRangeFilter[1].endOf('day').toISOString());
            if (pathType) params.set('pathType', pathType);

            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/export-all?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Export failed');

            const result = await response.json();
            const allRows = (result.data || []).map((item: ApproverItem) => ({
                ...item,
                mcCode: item.mcCode || inferMcCode(item.majorCategory)
            }));

            if (allRows.length === 0) {
                message.warning('No records found for the current filters');
                return;
            }

            const exportData = buildApproverExportData(allRows);
            const fileName = pathType === 'old' ? 'Old Articles' : pathType === 'new' ? 'New Articles' : pathType === 'rejected' ? 'Rejected Articles' : 'Articles';
            const divLabel = divisionFilter !== 'ALL' ? ` - ${divisionFilter}` : '';
            await exportToExcel(exportData, [...SIMPLE_APPROVER_EXPORT_HEADERS], [], `${fileName}${divLabel}`);
            message.success(`Exported ${allRows.length} records`);
        } catch {
            message.error('Export failed. Please try again.');
        } finally {
            hide();
            setExportingAll(false);
        }
    }, [statusFilter, divisionFilter, subDivisionFilter, searchText, dateRangeFilter, pathType, buildApproverExportData]);

    // Only PENDING items from the current page selection are eligible for approve/reject actions
    const pendingSelectedKeys = useMemo(() =>
        selectedRowKeys.filter(key =>
            items.find(item => item.id === key)?.approvalStatus === 'PENDING'
        ),
        [selectedRowKeys, items]
    );

    // field → schemaKey map for mandatory validation (mirrors ATTRIBUTE_FIELDS in ApproverArticleList)
    const FIELD_TO_SCHEMA_KEY: Record<string, string> = {
        macroMvgr: 'macro_mvgr', yarn1: 'yarn_01', mainMvgr: 'main_mvgr',
        fabricMainMvgr: 'fabric_main_mvgr', weave: 'weave', mFab2: 'm_fab2',
        composition: 'composition', fCount: 'f_count', fConstruction: 'f_construction',
        lycra: 'lycra_non_lycra', finish: 'finish', gsm: 'gsm',
        fOunce: 'f_ounce', fWidth: 'f_width',
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

    // Reactively check if ALL selected pending items have every visible dropdown field filled.
    // '-' counts as filled (frontend placeholder); only null/empty triggers a block.
    // Approve button is disabled when any item has an unfilled visible field.
    const approveBlockedReasons = useMemo(() => {
        const pendingItems = items.filter(i => pendingSelectedKeys.includes(i.id));
        const errors: { articleId: string; missing: string[] }[] = [];
        for (const item of pendingItems) {
            const missing: string[] = [];
            const majCat = normalizeMajorCategory(item.majorCategory || '', item.division || '');
            const mandatoryKeys = getMajCatMandatoryKeys(majCat);
            for (const [field, schemaKey] of Object.entries(FIELD_TO_SCHEMA_KEY)) {
                // Only check fields that are mandatory per Excel AND have dropdown values
                const hasValues = getMajCatAllowedValues(item.division || '', schemaKey) !== null;
                if (hasValues && mandatoryKeys.has(schemaKey) && !(item as any)[field]) {
                    missing.push(SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey] || schemaKey);
                }
            }
            // BOM / header fields — always mandatory regardless of division
            if (!item.mrp || Number(item.mrp) === 0) missing.push('MRP');
            if (!(item as any).impAtrbt2) missing.push('IMP_ATRBT-2');
            // referenceArticleDescription is optional
            if (missing.length > 0) {
                errors.push({
                    articleId: item.sapArticleId || item.articleNumber || item.imageName || item.id,
                    missing,
                });
            }
        }
        return errors;
    }, [pendingSelectedKeys, items]);

    const handleApprove = async () => {
        if (pendingSelectedKeys.length === 0) return;

        // Validate mandatory fields for all selected pending items before approving
        const pendingItems = items.filter(i => pendingSelectedKeys.includes(i.id));
        const errors: { articleId: string; missing: string[] }[] = [];

        for (const item of pendingItems) {
            const missing: string[] = [];

            // Only validate fields that are mandatory per Excel for this major category
            const majCat = normalizeMajorCategory(item.majorCategory || '', item.division || '');
            const mandatoryKeys = getMajCatMandatoryKeys(majCat);
            for (const [field, schemaKey] of Object.entries(FIELD_TO_SCHEMA_KEY)) {
                const hasValues = getMajCatAllowedValues(item.division || '', schemaKey) !== null;
                if (hasValues && mandatoryKeys.has(schemaKey) && !(item as any)[field]) {
                    missing.push(SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey] || schemaKey);
                }
            }
            // BOM / header fields — always mandatory regardless of division
            if (!item.mrp || Number(item.mrp) === 0) missing.push('MRP');
            if (!(item as any).impAtrbt2) missing.push('IMP_ATRBT-2');
            // referenceArticleDescription is optional

            if (missing.length > 0) {
                errors.push({
                    articleId: item.sapArticleId || item.articleNumber || item.imageName || item.id,
                    missing,
                });
            }
        }

        if (errors.length > 0) {
            Modal.error({
                title: 'Cannot Approve — Mandatory Fields Missing',
                width: 600,
                content: (
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {errors.map(({ articleId, missing }) => (
                            <div key={articleId} style={{ marginBottom: 12 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{articleId}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {missing.map(f => (
                                        <span key={f} style={{
                                            background: '#fff1f0', color: '#cf1322',
                                            border: '1px solid #ffa39e', borderRadius: 3,
                                            padding: '1px 6px', fontSize: 11,
                                        }}>{f}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ),
            });
            return;
        }

        Modal.confirm({
            title: 'Confirm Approval',
            content: `Are you sure you want to approve ${pendingSelectedKeys.length} items? This action cannot be undone.`,
            okText: 'Approve',
            okType: 'primary',
            onOk: async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/approve`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ ids: pendingSelectedKeys })
                    });

                    if (!response.ok) throw new Error('Approval failed');

                    const payload = await response.json();

                    if (payload?.sapSync) {
                        const { synced, failed, failures } = payload.sapSync;
                        if (failed === 0) {
                            message.success(`✅ Approved ${payload.count}. SAP sync: ${synced} synced successfully.`);
                        } else if (synced === 0) {
                            // All failed — show SAP error messages
                            const hasDetails = failures && failures.length > 0;
                            Modal.error({
                                title: `SAP Sync Failed (${failed} article${failed > 1 ? 's' : ''})`,
                                content: (
                                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        {hasDetails
                                            ? failures.map((f: { id: string; message: string }, i: number) => (
                                                <div key={i} style={{ marginBottom: 8, padding: '6px 8px', background: '#fff1f0', borderRadius: 4, fontSize: 13 }}>
                                                    <span style={{ color: '#cf1322' }}>{f.message}</span>
                                                </div>
                                            ))
                                            : (
                                                <div style={{ padding: '6px 8px', background: '#fff1f0', borderRadius: 4, fontSize: 13, color: '#cf1322' }}>
                                                    SAP rejected the article. Check the <strong>⚠ SAP Error</strong> banner on the article card below for the exact reason.
                                                </div>
                                            )
                                        }
                                        <div style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
                                            Please fix the highlighted field{failed > 1 ? 's' : ''} and try approving again.
                                        </div>
                                    </div>
                                ),
                                width: 520,
                            });
                        } else {
                            // Partial success
                            message.warning(`Approved ${synced} articles. ${failed} failed SAP sync.`);
                            if (failures && failures.length > 0) {
                                Modal.warning({
                                    title: `${failed} Article${failed > 1 ? 's' : ''} Failed SAP Sync`,
                                    content: (
                                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                            {failures.map((f: { id: string; message: string }, i: number) => (
                                                <div key={i} style={{ marginBottom: 8, padding: '6px 8px', background: '#fffbe6', borderRadius: 4, fontSize: 13 }}>
                                                    <span style={{ color: '#d46b08' }}>{f.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ),
                                    width: 520,
                                });
                            }
                        }
                    } else {
                        message.success('Items approved successfully');
                    }

                    setSelectedRowKeys([]);
                    fetchItems(1);
                } catch (error) {
                    message.error('Failed to approve items');
                }
            }
        });
    };

    const handleReject = async () => {
        if (pendingSelectedKeys.length === 0) return;

        Modal.confirm({
            title: 'Confirm Rejection',
            content: `Are you sure you want to reject ${pendingSelectedKeys.length} items?`,
            okText: 'Reject',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/reject`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ ids: pendingSelectedKeys })
                    });

                    if (!response.ok) throw new Error('Rejection failed');

                    message.success('Items rejected');
                    setSelectedRowKeys([]);
                    fetchItems(1);
                } catch (error) {
                    message.error('Failed to reject items');
                }
            }
        });
    };

    const handleCreateFabricArticle = (item: ApproverItem) => {
        Modal.confirm({
            title: 'Create Fabric Article',
            icon: <FileTextOutlined style={{ color: '#1677ff' }} />,
            content: `Create fabric article for article "${item.articleNumber || item.imageName || item.id}"?`,
            okText: 'Create Fabric Article',
            okButtonProps: { style: { background: '#1677ff', borderColor: '#1677ff' } },
            onOk: async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/create-fabric-article`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ ids: [item.id] }),
                    });
                    if (!response.ok) throw new Error('Request failed');
                    message.success('Fabric article creation initiated');
                    fetchItems(currentPage);
                } catch {
                    message.error('Failed to create fabric article');
                }
            },
        });
    };

    const handleCreateBodyArticle = (item: ApproverItem) => {
        Modal.confirm({
            title: 'Create Body Article',
            icon: <AppstoreAddOutlined style={{ color: '#722ed1' }} />,
            content: `Create body article for article "${item.articleNumber || item.imageName || item.id}"?`,
            okText: 'Create Body Article',
            okButtonProps: { style: { background: '#722ed1', borderColor: '#722ed1' } },
            onOk: async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/create-body-article`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ ids: [item.id] }),
                    });
                    if (!response.ok) throw new Error('Request failed');
                    message.success('Body article creation initiated');
                    fetchItems(currentPage);
                } catch {
                    message.error('Failed to create body article');
                }
            },
        });
    };

    const handleProceedFGArticle = (item: ApproverItem) => {
        Modal.confirm({
            title: 'Proceed for FG Article Creation',
            icon: <RocketOutlined style={{ color: '#f59e0b' }} />,
            content: `Proceed with FG article creation for article "${item.articleNumber || item.imageName || item.id}"?`,
            okText: 'Proceed',
            okButtonProps: { style: { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' } },
            onOk: async () => {
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/proceed-fg-article`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ ids: [item.id] }),
                    });
                    if (!response.ok) throw new Error('Request failed');
                    message.success('FG article creation initiated');
                    fetchItems(currentPage);
                } catch {
                    message.error('Failed to proceed with FG article creation');
                }
            },
        });
    };

    const handleEdit = (item: ApproverItem) => {
        setEditingItem(item);
        // Sync modal division tracker for cascading subDivision dropdown
        setModalDivision(item.division || undefined);
        form.setFieldsValue({
            // Core
            articleNumber: item.articleNumber,
            division: item.division,
            subDivision: item.subDivision,       // ✅ correct field
            majorCategory: item.majorCategory,   // ✅ its own field
            vendorName: item.vendorName,
            designNumber: item.designNumber,
            pptNumber: item.pptNumber,
            referenceArticleNumber: item.referenceArticleNumber,
            referenceArticleDescription: item.referenceArticleDescription,
            rate: item.rate,
            size: item.size,

            // Fabric
            fabricMainMvgr: item.fabricMainMvgr,
            composition: item.composition,
            weave: item.weave,
            macroMvgr: item.macroMvgr,
            mainMvgr: item.mainMvgr,
            mFab2: item.mFab2,
            gsm: item.gsm,
            finish: item.finish,
            shade: item.shade,
            weight: item.weight,
            lycra: item.lycra,
            yarn1: item.yarn1,

            // Design / Styling
            colour: item.colour,
            pattern: item.pattern,
            fit: item.fit,
            neck: item.neck,
            sleeve: item.sleeve,
            length: item.length,
            collar: item.collar,
            placket: item.placket,
            bottomFold: item.bottomFold,
            frontOpenStyle: item.frontOpenStyle,
            pocketType: item.pocketType,

            // Trims & Closure
            drawcord: item.drawcord,
            button: item.button,
            zipper: item.zipper,
            zipColour: item.zipColour,
            fatherBelt: item.fatherBelt,
            childBelt: item.childBelt,

            // Embellishment
            printType: item.printType,
            printStyle: item.printStyle,
            printPlacement: item.printPlacement,
            patches: item.patches,
            patchesType: item.patchesType,
            embroidery: item.embroidery,
            embroideryType: item.embroideryType,
            wash: item.wash,
            neckDetails: item.neckDetails,

            // New business fields
            vendorCode: item.vendorCode,
            mrp: item.mrp,
            mcCode: item.mcCode || inferMcCode(item.majorCategory),
            segment: item.segment,
            season: item.season,
            hsnTaxCode: item.hsnTaxCode,
            articleDescription: item.articleDescription,
            fashionGrid: item.fashionGrid,
            year: item.year,
            articleType: item.articleType,
        });
        setModalMarkdown(calcMarkdown(item.mrp, item.rate));
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        try {
            const values = await form.validateFields();
            const token = localStorage.getItem('authToken');

            // Auto-fill mcCode based on majorCategory
            // Populate when category changes OR mcCode is empty.
            if (values.majorCategory && (values.majorCategory !== editingItem?.majorCategory || !values.mcCode)) {
                values.mcCode = inferMcCode(values.majorCategory) || values.mcCode;
            }

            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${editingItem?.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(values)
            });

            if (!response.ok) {
                let errorText = 'Failed to update item';
                try {
                    const payload = await response.json();
                    if (payload?.error) {
                        errorText = payload.error;
                    }
                } catch {
                    // keep default fallback
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

    // Derive subDivision options based on current modal division
    const getSubDivisionOptions = (division: string | undefined): string[] => {
        if (!division) return [];
        if (division.match(/LADIES|WOMEN/i)) return SIMPLIFIED_HIERARCHY['Ladies'];
        if (division.match(/KIDS/i)) return SIMPLIFIED_HIERARCHY['Kids'];
        if (division.match(/MEN/i)) return SIMPLIFIED_HIERARCHY['MENS'];
        return [];
    };

    const coreDetailsTab = (
        <Row gutter={16}>
            <Col span={12}>
                <Form.Item name="articleNumber" label="Article Number">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="designNumber" label="Design Number">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="majorCategory" label="Major Category">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="division" label="Division">
                    <Select
                        allowClear={user?.role !== 'APPROVER' && user?.role !== 'CATEGORY_HEAD'}
                        disabled={(user?.role === 'APPROVER' || user?.role === 'CATEGORY_HEAD') && !!user?.division}
                        onChange={(val) => {
                            // Cascade: reset subDivision when division changes
                            setModalDivision(val);
                            form.setFieldsValue({ subDivision: undefined });
                        }}
                    >
                        <Option value="MEN">MENS</Option>
                        <Option value="LADIES">LADIES</Option>
                        <Option value="KIDS">KIDS</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={12}>
                {/* ✅ Sub-Division: properly bound to subDivision field, cascades from Division */}
                <Form.Item name="subDivision" label="Sub-Division">
                    <Select
                        allowClear
                        placeholder="Select sub-division"
                        disabled={user?.role === 'APPROVER' && !!user?.subDivision}
                        showSearch
                    >
                        {getSubDivisionOptions(modalDivision).map(sd => (
                            <Option key={sd} value={sd}>{sd}</Option>
                        ))}
                    </Select>
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="vendorName" label="Vendor Name">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="pptNumber" label="PPT Number">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="referenceArticleNumber" label="Ref. Article #">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="referenceArticleDescription" label="Ref. Description">
                    <Input />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="rate" label="Rate">
                    <Input
                        onChange={(e) => {
                            const md = calcMarkdown(form.getFieldValue('mrp'), e.target.value);
                            setModalMarkdown(md);
                        }}
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="mrp" label="MRP">
                    <Input
                        placeholder="e.g. 599"
                        onChange={(e) => {
                            const md = calcMarkdown(e.target.value, form.getFieldValue('rate'));
                            setModalMarkdown(md);
                        }}
                    />
                </Form.Item>
            </Col>
            {modalMarkdown !== null && (
                <Col span={24}>
                    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6, padding: '6px 12px', marginBottom: 8, fontSize: 13 }}>
                        <span style={{ color: '#595959' }}>Markdown: </span>
                        <span style={{ fontWeight: 700, color: '#2f54eb' }}>{modalMarkdown}</span>
                        <span style={{ color: '#8c8c8c', marginLeft: 8, fontSize: 12 }}>(MRP − Rate) ÷ MRP × 100</span>
                    </div>
                </Col>
            )}
            <Col span={12}>
                <Form.Item name="size" label="Size">
                    <Input />
                </Form.Item>
            </Col>
        </Row>
    );

    // Dynamic attributes tab — shows only the attributes relevant for the selected major category.
    // Values are filtered from the Excel grid data. Mandatory fields are marked with *.
    const attributesTab = (() => {
        const division = editingItem?.division || '';
        const majorCat = normalizeMajorCategory(editingItem?.majorCategory || '', division);
        const mandatoryKeys = getMajCatMandatoryKeys(majorCat);

        const visibleFields = ATTRIBUTE_FIELDS.filter(field => {
            if (!majorCat) return true; // no major category yet → show all so user can fill in
            // Always show fields that already have a value (even if not mandatory) so user can clear bad values
            const currentValue = editingItem?.[field.formName as keyof typeof editingItem];
            if (currentValue) return true;
            // Show mandatory fields that have dropdown values
            if (!mandatoryKeys.has(field.schemaKey)) return false;
            const values = getMajCatAllowedValues(division, field.schemaKey);
            return values !== null;
        });

        if (visibleFields.length === 0) {
            return (
                <div style={{ padding: 24, textAlign: 'center', color: '#8c8c8c' }}>
                    No attributes defined for this major category.
                </div>
            );
        }

        return (
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        {visibleFields.map(field => {
                            const values = division ? getMajCatAllowedValues(division, field.schemaKey) : null;
                            const isMandatory = mandatoryKeys.has(field.schemaKey);
                            return (
                                <tr key={field.formName} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{
                                        padding: '6px 12px 6px 0',
                                        width: 180,
                                        verticalAlign: 'middle',
                                        fontSize: 13,
                                        fontWeight: isMandatory ? 600 : 400,
                                        color: isMandatory ? '#1f1f1f' : '#595959',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {isMandatory && <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>}
                                        {field.label}
                                    </td>
                                    <td style={{ padding: '4px 0' }}>
                                        <Form.Item name={field.formName} style={{ margin: 0 }}>
                                            {values ? (
                                                <Select
                                                    showSearch
                                                    allowClear
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                    placeholder="Select..."
                                                    optionFilterProp="children"
                                                >
                                                    {values.map(v => (
                                                        <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>
                                                    ))}
                                                </Select>
                                            ) : (
                                                <Input size="small" placeholder="Enter value..." />
                                            )}
                                        </Form.Item>
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
        <Row gutter={16}>
            <Col span={24}><Typography.Title level={5}>Business & SAP Fields</Typography.Title></Col>
            <Col span={8}><Form.Item name="vendorCode" label="Vendor Code"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="mcCode" label="MC Code"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="segment" label="Segment"><Input placeholder="e.g. PREMIUM, VALUE" /></Form.Item></Col>
            <Col span={8}><Form.Item name="season" label="Season"><Input placeholder="e.g. SS25, AW24" /></Form.Item></Col>
            <Col span={8}><Form.Item name="hsnTaxCode" label="HSN Tax Code"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="fashionGrid" label="Fashion Grid"><Input placeholder="e.g. BASIC, FASHION" /></Form.Item></Col>
            <Col span={8}><Form.Item name="year" label="Year"><Input placeholder="e.g. 2024-25" /></Form.Item></Col>
            <Col span={8}><Form.Item name="articleType" label="Article Type"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="articleDescription" label="Article Description"><Input.TextArea rows={3} /></Form.Item></Col>
        </Row>
    );

    return (
        <div>
            <div style={{ marginBottom: 6, flexShrink: 0 }}>
                <div style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #ebebeb',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                }}>
                    {/* Title row */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        background: 'linear-gradient(90deg, #fafafa 0%, #f5f3ff 100%)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 6, height: 22, borderRadius: 3,
                                background: 'linear-gradient(180deg, #6366f1, #a78bfa)',
                            }} />
                            <span style={{ fontWeight: 700, fontSize: 15, color: '#1e1b4b' }}>
                                {pathType === 'old' ? 'Old Articles' : pathType === 'new' ? 'New Articles' : pathType === 'rejected' ? 'Rejected Articles' : pathType === 'created' ? 'Created Articles' : 'Approver Dashboard'}
                            </span>
                            {user?.division && (
                                <span style={{
                                    fontSize: 11, color: '#7c3aed', fontWeight: 500,
                                    background: '#ede9fe', borderRadius: 20, padding: '2px 10px',
                                }}>
                                    {formatDivisionLabel(user.division)}{user.subDivision ? ` · ${user.subDivision}` : ''}
                                </span>
                            )}
                        </div>
                        <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, letterSpacing: 1.5 }}>
                            AI FASHION
                        </span>
                    </div>

                    {/* Filter row */}
                    <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid #f0f0f0' }}>
                        <Row gutter={[10, 8]} align="middle">
                            <Col xs={24} sm={12} md={7}>
                                <Input.Search
                                    placeholder="Search article, vendor, design, PPT no..."
                                    onSearch={val => setSearchText(val)}
                                    onChange={handleSearchChange}
                                    allowClear
                                    onClear={() => setSearchText('')}
                                />
                            </Col>
                            {pathType !== 'rejected' && pathType !== 'created' && pathType !== 'new' && (
                            <Col xs={12} sm={6} md={4}>
                                <Select style={{ width: '100%' }} value={statusFilter} onChange={(val) => setStatusFilter(val)}>
                                    <Option value="ALL">All Statuses</Option>
                                    <Option value="PENDING">Pending</Option>
                                    <Option value="APPROVED">Approved</Option>
                                    <Option value="FAILED">Failed</Option>
                                </Select>
                            </Col>
                            )}
                            {(showDivisionFilter || user?.role === 'ADMIN') && (
                                <Col xs={12} sm={6} md={4}>
                                    <Select style={{ width: '100%' }} placeholder="Division" value={divisionFilter}
                                        onChange={(val) => { setDivisionFilter(val); setSubDivisionFilter('ALL'); }}>
                                        <Option value="ALL">All Divisions</Option>
                                        {user?.role === 'ADMIN' ? (
                                            <><Option value="MEN">MENS</Option><Option value="LADIES">LADIES</Option><Option value="KIDS">KIDS</Option></>
                                        ) : userAssignedDivisions.map(d => <Option key={d} value={d}>{formatDivisionLabel(d)}</Option>)}
                                    </Select>
                                </Col>
                            )}
                            {(showSubDivisionFilter || user?.role === 'ADMIN') && (
                                <Col xs={12} sm={6} md={4}>
                                    <Select style={{ width: '100%' }} placeholder="Sub-Division" value={subDivisionFilter}
                                        onChange={(val) => { setSubDivisionFilter(val); setMajorCategoryFilter(''); }} showSearch>
                                        <Option value="ALL">All Sub-Divs</Option>
                                        {user?.role === 'ADMIN'
                                            ? (getSubDivisionOptions(divisionFilter === 'ALL' ? undefined : divisionFilter).length > 0
                                                ? getSubDivisionOptions(divisionFilter === 'ALL' ? undefined : divisionFilter).map(sd => <Option key={sd} value={sd}>{sd}</Option>)
                                                : [...SIMPLIFIED_HIERARCHY['MENS'], ...SIMPLIFIED_HIERARCHY['Ladies'], ...SIMPLIFIED_HIERARCHY['Kids']].map(sd => <Option key={sd} value={sd}>{sd}</Option>))
                                            : userAssignedSubDivisions.map(sd => <Option key={sd} value={sd}>{sd}</Option>)
                                        }
                                    </Select>
                                </Col>
                            )}
                            {/* Major Category single-select */}
                            <Col xs={12} sm={6} md={4}>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Major Category"
                                    value={majorCategoryFilter || undefined}
                                    onChange={(val) => setMajorCategoryFilter(val ?? '')}
                                    showSearch
                                    allowClear
                                    optionFilterProp="children"
                                >
                                    {(() => {
                                        const div = divisionFilter === 'ALL' ? '' : divisionFilter;
                                        let prefixRegex: RegExp | null = null;
                                        if (div.match(/MEN/i)) prefixRegex = /^M|^MW/i;
                                        else if (div.match(/LADIES|WOMEN/i)) prefixRegex = /^L|^LW/i;
                                        else if (div.match(/KIDS/i)) prefixRegex = /^(K|I|J|Y|G)/i;
                                        return MAJOR_CATEGORY_ALLOWED_VALUES
                                            .filter(v => !prefixRegex || v.shortForm.match(prefixRegex))
                                            .map(v => <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>);
                                    })()}
                                </Select>
                            </Col>
                            <Col xs={24} sm={12} md={5}>
                                <RangePicker style={{ width: '100%' }} value={dateRangeFilter}
                                    onChange={(dates) => setDateRangeFilter(dates)}
                                    allowEmpty={[true, true]} format="DD-MM-YYYY"
                                    placeholder={['Start date', 'End date']} />
                            </Col>
                        </Row>
                    </div>

                    {/* Action row */}
                    <div style={{ padding: '8px 16px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                        {/* Row 1: counts + standard actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
                                {totalCount.toLocaleString()} records
                                {selectedRowKeys.length > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}>· {selectedRowKeys.length} selected</span>}
                            </span>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchItems(currentPage)}>Refresh</Button>
                                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportSelected} disabled={selectedRowKeys.length === 0}>
                                    Export Selected
                                </Button>
                                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportAll} loading={exportingAll}
                                    style={{ background: 'linear-gradient(90deg,#6366f1,#818cf8)', color: '#fff', border: 'none', fontWeight: 600 }}>
                                    Export All ({totalCount})
                                </Button>
                                <Button size="small" danger icon={<CloseCircleOutlined />} onClick={handleReject} disabled={pendingSelectedKeys.length === 0}>
                                    Reject ({pendingSelectedKeys.length})
                                </Button>
                                <Tooltip
                                    placement="bottomRight"
                                    color="#fff"
                                    styles={{ root: { maxWidth: 500 }, body: { background: '#fff7f7', border: '1px solid #ffccc7', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 16px rgba(255,77,79,0.15)' } }}
                                    title={approveBlockedReasons.length > 0 ? (
                                        <div style={{ color: '#434343', fontSize: 12, lineHeight: '1.6' }}>
                                            <div style={{ fontWeight: 700, marginBottom: 6, color: '#cf1322', fontSize: 13 }}>⚠ Fill required fields first:</div>
                                            {approveBlockedReasons.slice(0, 5).map(({ articleId, missing }) => (
                                                <div key={articleId} style={{ marginBottom: 6, background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 4, padding: '4px 8px' }}>
                                                    <span style={{ fontWeight: 600, color: '#d46b08' }}>{articleId}: </span>
                                                    <span style={{ color: '#a8071a' }}>{missing.join(', ')}</span>
                                                </div>
                                            ))}
                                            {approveBlockedReasons.length > 5 && <div style={{ color: '#8c8c8c', marginTop: 4 }}>...and {approveBlockedReasons.length - 5} more articles</div>}
                                        </div>
                                    ) : ''}
                                >
                                    <Button
                                        size="small"
                                        icon={<CheckCircleOutlined />}
                                        onClick={handleApprove}
                                        disabled={pendingSelectedKeys.length === 0 || approveBlockedReasons.length > 0}
                                        style={pendingSelectedKeys.length > 0 && approveBlockedReasons.length === 0
                                            ? { background: 'linear-gradient(90deg,#10b981,#34d399)', color: '#fff', border: 'none', fontWeight: 600 }
                                            : {}}
                                    >
                                        Approve ({pendingSelectedKeys.length})
                                        {approveBlockedReasons.length > 0 && <span style={{ marginLeft: 4, fontSize: 10, color: '#ff4d4f' }}>⚠ {approveBlockedReasons.length} incomplete</span>}
                                    </Button>
                                </Tooltip>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <div style={{ marginTop: 6 }}>
                <ApproverArticleList
                    items={items}
                    majorCategory={majorCategoryFilter}
                    loading={loading}
                    selectedRowKeys={selectedRowKeys}
                    onSelectionChange={setSelectedRowKeys}
                    onEdit={handleEdit}
                    onCreateFabricArticle={handleCreateFabricArticle}
                    onCreateBodyArticle={handleCreateBodyArticle}
                    onProceedFGArticle={handleProceedFGArticle}
                    attributes={attributes}
                    onRefresh={() => fetchItems(currentPage)}
                    serverPagination={{
                        total: totalCount,
                        current: currentPage,
                        pageSize: PAGE_SIZE,
                        onChange: (page) => { setSelectedRowKeys([]); fetchItems(page); }
                    }}
                    onSave={async (row, directUpdates) => {
                        const newData = [...items];
                        const index = newData.findIndex((item) => item.id === row.id);
                        let updatePayload: Record<string, unknown> = {};
                        if (index > -1) {
                            const item = newData[index];

                            // Build payload from directUpdates — the exact fields the user changed.
                            // This avoids stale-closure diffs that could send the wrong fields.
                            updatePayload = Object.fromEntries(
                                Object.entries(directUpdates || {})
                                    .map(([key, value]) => [key, value === undefined ? null : value])
                            );
                            // Fallback: compute diff from full row (legacy path, should rarely trigger)
                            if (Object.keys(updatePayload).length === 0) {
                                updatePayload = Object.fromEntries(
                                    Object.entries(row)
                                        .filter(([key, value]) => (item as any)[key] !== value)
                                        .map(([key, value]) => [key, value === undefined ? null : value])
                                );
                            }
                            if (updatePayload.majorCategory && !updatePayload.mcCode) {
                                updatePayload.mcCode = inferMcCode(updatePayload.majorCategory as string) || undefined;
                            }

                            // Optimistic update — show change immediately in the list
                            newData.splice(index, 1, { ...item, ...updatePayload });
                            setItems(newData);
                        }
                        if (Object.keys(updatePayload).length === 0) {
                            return;
                        }
                        try {
                            const token = localStorage.getItem('authToken');
                            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${row.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify(updatePayload)
                            });
                            if (!response.ok) {
                                const errText = await response.text();
                                console.error('[onSave] Save failed:', response.status, errText);
                                throw new Error('Update failed');
                            }
                            // Sync server's authoritative values (articleDescription, segment,
                            // mcCode, hsnTaxCode, year, season) back into items state so the
                            // card reflects derived-field recalculations without a full reload.
                            const saved = await response.json();
                            setItems(prev => {
                                const idx = prev.findIndex(i => i.id === saved.id);
                                if (idx === -1) return prev;
                                const copy = [...prev];
                                copy[idx] = {
                                    ...copy[idx],
                                    ...saved,
                                    // Apply the same mcCode inference that fetchItems uses
                                    mcCode: saved.mcCode || inferMcCode(saved.majorCategory) || copy[idx].mcCode || '',
                                };
                                return copy;
                            });
                            message.success('Saved');
                        } catch {
                            message.error('Failed to save');
                            // On error, resync from server to undo the optimistic update
                            fetchItems(currentPage);
                        }
                    }}
                />
            </div>

            <Modal
                title="Edit Article Details"
                open={isEditModalOpen}
                onOk={handleSaveEdit}
                onCancel={() => setIsEditModalOpen(false)}
                okText="Save Changes"
                width={1000}
                centered
            >
                <Form form={form} layout="vertical">
                    <Tabs
                        defaultActiveKey="core"
                        items={[
                            { label: 'Core Details', key: 'core', children: coreDetailsTab },
                            { label: 'Attributes', key: 'attributes', children: attributesTab },
                            { label: 'Business & SAP', key: 'business', children: businessTab },
                        ]}
                    />
                </Form>
            </Modal>
        </div>
    );
}
