import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Typography, message, Modal, Form, Input, Select, Row, Col, Tabs, DatePicker } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { ApproverTable } from '../components/ApproverTable';
import type { ApproverItem, MasterAttribute } from '../components/ApproverTable';
import { APP_CONFIG } from '../../../constants/app/config';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
import { getMcCodeByMajorCategory } from '../../../data/majorCategoryMcCodeMap';
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

const calculateMrpFromRate = (rateOrCost: unknown): number | null => {
    const rate = parseNumericValue(rateOrCost);
    if (rate === null) return null;

    const priceWithMargin = rate + (rate * 0.47);
    return Math.ceil(priceWithMargin / 25) * 25;
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

const SIMPLE_APPROVER_EXPORT_HEADERS = [
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
    'Colour',
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

export default function ApproverDashboard() {
    const [items, setItems] = useState<ApproverItem[]>([]);
    const [attributes, setAttributes] = useState<MasterAttribute[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [user, setUser] = useState<any>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string[]>(['ALL']);
    const [searchText, setSearchText] = useState('');
    const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
    const [subDivisionFilter, setSubDivisionFilter] = useState<string>('ALL');
    const [dateRangeFilter, setDateRangeFilter] = useState<[Dayjs | null, Dayjs | null] | null>(null);

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
    // Track if user manually edited MRP so Rate onChange doesn't overwrite it
    const [mrpManuallyEdited, setMrpManuallyEdited] = useState(false);

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

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('authToken');
            // Fetch all RBAC-scoped records once — filtering is done client-side
            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items?limit=10000&status=ALL`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch items');

            const result = await response.json();
            const withMcCode = (result.data || []).map((item: ApproverItem) => ({
                ...item,
                mcCode: item.mcCode || inferMcCode(item.majorCategory)
            }));
            setItems(withMcCode);
        } catch (error) {
            message.error('Failed to load items');
        } finally {
            setLoading(false);
        }
    }, []); // No filter dependencies — filters are applied client-side

    // Client-side filtering — instant, no API calls, no race conditions
    const filteredItems = useMemo(() => {
        let result = items;

        // RBAC enforcement: APPROVER sees only their assigned division + sub-division
        if (user?.role === 'APPROVER') {
            if (user.division) {
                const userDivisions = getDivisionVariants(user.division);
                if (userDivisions.length > 0) {
                    result = result.filter(item =>
                        userDivisions.includes(normalizeText(item.division))
                    );
                }
            }
            if (user.subDivision) {
                const userSubDivs = getSubDivisionVariants(user.subDivision);
                if (userSubDivs.length > 0) {
                    // Also show articles with null/empty subDivision (not yet categorised)
                    result = result.filter(item =>
                        !item.subDivision || userSubDivs.includes(normalizeText(item.subDivision))
                    );
                }
            }
        }

        // RBAC enforcement: CATEGORY_HEAD sees only their assigned division
        if (user?.role === 'CATEGORY_HEAD' && user.division) {
            const userDivisions = getDivisionVariants(user.division);
            if (userDivisions.length > 0) {
                result = result.filter(item =>
                    userDivisions.includes(normalizeText(item.division))
                );
            }
        }

        // Status filter (user-controlled)
        if (!statusFilter.includes('ALL') && statusFilter.length > 0) {
            result = result.filter(item => statusFilter.includes(item.approvalStatus || ''));
        }

        // Division filter (admin: all divisions; non-admin: only their assigned divisions when >1)
        if (divisionFilter !== 'ALL') {
            const divisionVariants = getDivisionVariants(divisionFilter);
            result = result.filter(item =>
                divisionVariants.includes(normalizeText(item.division))
            );
        }

        // Sub-division filter (admin: all sub-divisions; non-admin: only their assigned sub-divisions when >1)
        if (subDivisionFilter !== 'ALL') {
            result = result.filter(item =>
                normalizeText(item.subDivision) === normalizeText(subDivisionFilter)
            );
        }

        // Created date filter (inclusive of the full end day)
        if (dateRangeFilter?.[0] || dateRangeFilter?.[1]) {
            const startDate = dateRangeFilter?.[0]?.startOf('day').valueOf() ?? null;
            const endDate = dateRangeFilter?.[1]?.endOf('day').valueOf() ?? null;

            result = result.filter(item => {
                const createdAt = new Date(item.createdAt).getTime();
                if (Number.isNaN(createdAt)) return false;
                if (startDate !== null && createdAt < startDate) return false;
                if (endDate !== null && createdAt > endDate) return false;
                return true;
            });
        }

        // Search filter
        if (searchText) {
            const q = searchText.toLowerCase();
            result = result.filter(item =>
                item.articleNumber?.toLowerCase().includes(q) ||
                item.vendorName?.toLowerCase().includes(q) ||
                item.designNumber?.toLowerCase().includes(q) ||
                item.pptNumber?.toLowerCase().includes(q)
            );
        }

        return result;
    }, [items, user, statusFilter, divisionFilter, subDivisionFilter, dateRangeFilter, searchText]);

    useEffect(() => {
        fetchAttributes();
        fetchItems();
    }, []); // Intentionally run once on mount — filters are applied client-side

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
                'Colour': row.colour || '',
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

        const selectedItems = filteredItems.filter((item) => selectedRowKeys.includes(item.id));
        if (selectedItems.length === 0) {
            message.warning('No selected articles available to export');
            return;
        }

        const exportData = buildApproverExportData(selectedItems);
        await exportToExcel(exportData, [...SIMPLE_APPROVER_EXPORT_HEADERS], [], 'Article Creation');
    }, [buildApproverExportData, filteredItems, selectedRowKeys]);

    // Only PENDING items from the selection are eligible for approve/reject actions
    const pendingSelectedKeys = useMemo(() =>
        selectedRowKeys.filter(key =>
            filteredItems.find(item => item.id === key)?.approvalStatus === 'PENDING'
        ),
        [selectedRowKeys, filteredItems]
    );

    const handleApprove = async () => {
        if (pendingSelectedKeys.length === 0) return;

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
                        message.success(`Approved ${payload.count}. SAP sync: ${payload.sapSync.synced} synced, ${payload.sapSync.failed} failed.`);
                    } else {
                        message.success('Items approved successfully');
                    }

                    setSelectedRowKeys([]);
                    fetchItems();
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
                    fetchItems();
                } catch (error) {
                    message.error('Failed to reject items');
                }
            }
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
        setMrpManuallyEdited(false);
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

            // Auto-derive MRP from rate only if MRP was not manually set
            const originalMrp = editingItem?.mrp != null ? String(editingItem.mrp) : '';
            const currentMrp = values.mrp != null ? String(values.mrp) : '';
            const mrpUnchanged = currentMrp === originalMrp || currentMrp === '';
            if (values.rate !== undefined && mrpUnchanged) {
                values.mrp = calculateMrpFromRate(values.rate);
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
            fetchItems();
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
                            if (!mrpManuallyEdited) {
                                const mrp = calculateMrpFromRate(e.target.value);
                                form.setFieldsValue({ mrp });
                            }
                        }}
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="mrp" label="MRP">
                    <Input
                        placeholder="e.g. 599"
                        onChange={() => setMrpManuallyEdited(true)}
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item name="size" label="Size">
                    <Input />
                </Form.Item>
            </Col>
        </Row>
    );

    const attributesTab = (
        <Row gutter={16} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <Col span={24}><Typography.Title level={5}>Fabric Details</Typography.Title></Col>
            <Col span={8}>
                <Form.Item name="macroMvgr" label="Macro MVGR">
                    <Select showSearch allowClear optionFilterProp="children" placeholder="Select...">
                        {attributes.find(a => a.key === 'MACRO_MVGR')?.allowedValues?.map(v => (
                            <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>
                        ))}
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item name="mainMvgr" label="Main MVGR">
                    <Select showSearch allowClear optionFilterProp="children" placeholder="Select...">
                        {attributes.find(a => a.key === 'MAIN_MVGR')?.allowedValues?.map(v => (
                            <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>
                        ))}
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="yarn1" label="Yarn 1"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="fabricMainMvgr" label="Fabric Main MVGR"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="weave" label="Weave"><Input /></Form.Item></Col>
            <Col span={8}>
                <Form.Item name="mFab2" label="M FAB 2">
                    <Select showSearch allowClear optionFilterProp="children" placeholder="Select...">
                        {attributes.find(a => a.key === 'M_FAB2')?.allowedValues?.map(v => (
                            <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>
                        ))}
                    </Select>
                </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="composition" label="Composition"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="finish" label="Finish"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="gsm" label="GSM"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="weight" label="G-Weight"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="lycra" label="Lycra"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="shade" label="Shade"><Input /></Form.Item></Col>

            <Col span={24}><Typography.Title level={5}>Styling & Design</Typography.Title></Col>
            <Col span={8}><Form.Item name="colour" label="Color"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="pattern" label="Pattern"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="fit" label="Fit"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="wash" label="Wash"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="neck" label="Neck"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="neckDetails" label="Neck Details"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="collar" label="Collar"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="placket" label="Placket"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="sleeve" label="Sleeve"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="length" label="Length"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="bottomFold" label="Bottom Fold"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="frontOpenStyle" label="Front Open"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="pocketType" label="Pocket"><Input /></Form.Item></Col>

            <Col span={24}><Typography.Title level={5}>Trims & Closure</Typography.Title></Col>
            <Col span={8}><Form.Item name="drawcord" label="Drawcord"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="button" label="Button"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="zipper" label="Zipper"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="zipColour" label="Zip Color"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="fatherBelt" label="Father Belt"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="childBelt" label="Child Belt"><Input /></Form.Item></Col>

            <Col span={24}><Typography.Title level={5}>Embellishments</Typography.Title></Col>
            <Col span={8}><Form.Item name="printType" label="Print Type"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="printStyle" label="Print Style"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="printPlacement" label="Print Placement"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="patches" label="Patches"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="patchesType" label="Patch Type"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="embroidery" label="Embroidery"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="embroideryType" label="Embroidery Type"><Input /></Form.Item></Col>
        </Row>
    );

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        <Title level={4} style={{ margin: 0 }}>Approver Dashboard</Title>
                        {user?.division && <Text type="success" style={{ fontSize: 12 }}>Scope: {formatDivisionLabel(user.division)} {user.subDivision ? `(${user.subDivision})` : ''}</Text>}
                    </div>
                </div>

                <Card size="small" style={{ marginBottom: 0 }}>
                    <Row gutter={[12, 12]} align="middle">
                        <Col xs={24} sm={8} md={5}>
                            <Input.Search
                                placeholder="Search Article, Vendor, Design #"
                                onSearch={val => setSearchText(val)}
                                onChange={e => setSearchText(e.target.value)}
                                allowClear
                            />
                        </Col>
                        <Col xs={24} sm={8} md={4}>
                            <Select
                                mode="multiple"
                                style={{ width: '100%' }}
                                placeholder="Filter Status"
                                value={statusFilter}
                                onChange={setStatusFilter}
                                maxTagCount="responsive"
                            >
                                <Option value="PENDING">Pending</Option>
                                <Option value="APPROVED">Approved</Option>
                                <Option value="FAILED">Failed</Option>
                                <Option value="REJECTED">Rejected</Option>
                                <Option value="ALL">All Statuses</Option>
                            </Select>
                        </Col>

                        {/* Non-admin: show division filter if user has multiple divisions */}
                        {showDivisionFilter && (
                            <Col xs={24} sm={8} md={3}>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Division"
                                    value={divisionFilter}
                                    onChange={(val) => {
                                        setDivisionFilter(val);
                                        setSubDivisionFilter('ALL');
                                    }}
                                >
                                    <Option value="ALL">All Divisions</Option>
                                    {userAssignedDivisions.map(d => (
                                        <Option key={d} value={d}>{formatDivisionLabel(d)}</Option>
                                    ))}
                                </Select>
                            </Col>
                        )}

                        {/* Non-admin: show sub-division filter if user has multiple sub-divisions */}
                        {showSubDivisionFilter && (
                            <Col xs={24} sm={8} md={3}>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Sub-Division"
                                    value={subDivisionFilter}
                                    onChange={setSubDivisionFilter}
                                >
                                    <Option value="ALL">All Sub-Divs</Option>
                                    {userAssignedSubDivisions.map(sd => (
                                        <Option key={sd} value={sd}>{sd}</Option>
                                    ))}
                                </Select>
                            </Col>
                        )}

                        {/* Admin Filters */}
                        {user?.role === 'ADMIN' && (
                            <>
                                <Col xs={24} sm={8} md={3}>
                                    <Select
                                        style={{ width: '100%' }}
                                        placeholder="Division"
                                        value={divisionFilter}
                                        onChange={(val) => {
                                            setDivisionFilter(val);
                                            setSubDivisionFilter('ALL'); // reset sub-div when division changes
                                        }}
                                    >
                                        <Option value="ALL">All Divisions</Option>
                                        <Option value="MEN">MENS</Option>
                                        <Option value="LADIES">LADIES</Option>
                                        <Option value="KIDS">KIDS</Option>
                                    </Select>
                                </Col>
                                <Col xs={24} sm={8} md={3}>
                                    <Select
                                        style={{ width: '100%' }}
                                        placeholder="Sub-Division"
                                        value={subDivisionFilter}
                                        onChange={setSubDivisionFilter}
                                    >
                                        <Option value="ALL">All Sub-Divs</Option>
                                        {getSubDivisionOptions(divisionFilter === 'ALL' ? undefined : divisionFilter).length > 0
                                            ? getSubDivisionOptions(divisionFilter === 'ALL' ? undefined : divisionFilter).map(sd => (
                                                <Option key={sd} value={sd}>{sd}</Option>
                                            ))
                                            : <>
                                                {SIMPLIFIED_HIERARCHY['MENS'].map(sd => <Option key={sd} value={sd}>{sd}</Option>)}
                                                {SIMPLIFIED_HIERARCHY['Ladies'].map(sd => <Option key={sd} value={sd}>{sd}</Option>)}
                                                {SIMPLIFIED_HIERARCHY['Kids'].map(sd => <Option key={sd} value={sd}>{sd}</Option>)}
                                            </>
                                        }
                                    </Select>
                                </Col>
                            </>
                        )}

                        <Col xs={24} sm={16} md={4}>
                            <RangePicker
                                style={{ width: '100%' }}
                                value={dateRangeFilter}
                                onChange={(dates) => setDateRangeFilter(dates)}
                                allowEmpty={[true, true]}
                                format="DD-MM-YYYY"
                            />
                        </Col>

                        <Col xs={24} sm={24} md={5} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, whiteSpace: 'nowrap' }}>
                            <Button icon={<ReloadOutlined />} onClick={fetchItems}>Refresh</Button>
                            <Button icon={<DownloadOutlined />} onClick={handleExportSelected} disabled={selectedRowKeys.length === 0}>
                                Excel ({selectedRowKeys.length})
                            </Button>
                            <Button
                                danger
                                icon={<CloseCircleOutlined />}
                                onClick={handleReject}
                                disabled={pendingSelectedKeys.length === 0}
                            >
                                Reject ({pendingSelectedKeys.length})
                            </Button>
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={handleApprove}
                                disabled={pendingSelectedKeys.length === 0}
                                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                            >
                                Approve ({pendingSelectedKeys.length})
                            </Button>
                        </Col>
                    </Row>
                </Card>
            </div>

            <Card
                variant="borderless"
                className="shadow-sm"
                style={{ marginTop: 6 }}
                styles={{ body: { padding: '6px 8px' } }}
            >
                    <ApproverTable
                        items={filteredItems}
                        loading={loading}
                        selectedRowKeys={selectedRowKeys}
                        onSelectionChange={setSelectedRowKeys}
                        onEdit={handleEdit}
                        attributes={attributes}
                        user={user}
                        onSave={async (row) => {
                        // Optimistic update
                        const newData = [...items];
                        const index = newData.findIndex((item) => item.id === row.id);
                        let updatePayload: Record<string, unknown> = {};
                        if (index > -1) {
                            const item = newData[index];

                            // Auto-fill mcCode based on majorCategory
                            if (row.majorCategory && (row.majorCategory !== item.majorCategory || !row.mcCode)) {
                                row.mcCode = inferMcCode(row.majorCategory) || row.mcCode;
                            }

                            newData.splice(index, 1, {
                                ...item,
                                ...row,
                            });
                            setItems(newData);

                            updatePayload = Object.fromEntries(
                                Object.entries(row)
                                    .filter(([key, value]) => (item as any)[key] !== value)
                                    .map(([key, value]) => [key, value === undefined ? null : value])
                            );
                        }

                        if (Object.keys(updatePayload).length === 0) {
                            message.info('No changes to save');
                            return;
                        }

                        // API Update
                        try {
                            const token = localStorage.getItem('authToken');
                            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${row.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify(updatePayload)
                            });
                            if (!response.ok) throw new Error('Update failed');
                            message.success('Updated');
                        } catch (error) {
                            message.error('Failed to update');
                            fetchItems(); // Revert on failure
                        }
                        }}
                    />
            </Card>

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
