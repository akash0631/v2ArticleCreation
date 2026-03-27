import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Typography, message, Modal, Form, Input, Select, Row, Col, Tabs } from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { ApproverTable } from '../components/ApproverTable';
import type { ApproverItem, MasterAttribute } from '../components/ApproverTable';
import { APP_CONFIG } from '../../../constants/app/config';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
import { getMcCodeByMajorCategory } from '../../../data/majorCategoryMcCodeMap';

const { Title, Text } = Typography;
const { Option } = Select;

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
            const params = new URLSearchParams();

            if (statusFilter.length > 0 && !statusFilter.includes('ALL')) {
                params.append('status', statusFilter.join(','));
            } else if (statusFilter.includes('ALL')) {
                params.append('status', 'ALL');
            }

            if (searchText) {
                params.append('search', searchText);
            }

            if (divisionFilter !== 'ALL') {
                params.append('division', divisionFilter);
            }

            if (subDivisionFilter !== 'ALL') {
                params.append('subDivision', subDivisionFilter);
            }

            // Fetch all records — front-end pagination handles display
            params.append('limit', '10000');

            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items?${params.toString()}`, {
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
    }, [statusFilter, searchText, divisionFilter, subDivisionFilter]);

    useEffect(() => {
        fetchAttributes();
        fetchItems();
    }, [fetchItems, fetchAttributes]);

    const handleApprove = async () => {
        if (selectedRowKeys.length === 0) return;

        Modal.confirm({
            title: 'Confirm Approval',
            content: `Are you sure you want to approve ${selectedRowKeys.length} items? This action cannot be undone.`,
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
                        body: JSON.stringify({ ids: selectedRowKeys })
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
        if (selectedRowKeys.length === 0) return;

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: selectedRowKeys })
            });

            if (!response.ok) throw new Error('Rejection failed');

            message.success('Items rejected');
            setSelectedRowKeys([]);
            fetchItems();
        } catch (error) {
            message.error('Failed to reject items');
        }
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
            gsm: item.gsm,
            finish: item.finish,
            shade: item.shade,
            weight: item.weight,
            lycra: item.lycra,
            yarn1: item.yarn1,
            yarn2: item.yarn2,

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

            // Always derive MRP from Rate/Cost:
            // MRP = ceil((rate + 33%) / 25) * 25
            if (values.rate !== undefined) {
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
        if (division.match(/MEN/i)) return SIMPLIFIED_HIERARCHY['Mens'];
        if (division.match(/LADIES|WOMEN/i)) return SIMPLIFIED_HIERARCHY['Ladies'];
        if (division.match(/KIDS/i)) return SIMPLIFIED_HIERARCHY['Kids'];
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
                        <Option value="MEN">MEN</Option>
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
                            const mrp = calculateMrpFromRate(e.target.value);
                            form.setFieldsValue({ mrp });
                        }}
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
            <Col span={8}><Form.Item name="fabricMainMvgr" label="Fabric Main"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="composition" label="Composition"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="weave" label="Weave"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="gsm" label="GSM"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="finish" label="Finish"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="shade" label="Shade"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="weight" label="G-Weight"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="lycra" label="Lycra"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="yarn1" label="Yarn 1"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="yarn2" label="Yarn 2"><Input /></Form.Item></Col>

            <Col span={24}><Typography.Title level={5}>Styling & Design</Typography.Title></Col>
            <Col span={8}><Form.Item name="colour" label="Color"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="pattern" label="Pattern"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="fit" label="Fit"><Input /></Form.Item></Col>
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
            <Col span={8}><Form.Item name="wash" label="Wash"><Input /></Form.Item></Col>
        </Row>
    );

    const businessTab = (
        <Row gutter={16}>
            <Col span={24}><Typography.Title level={5}>Business & SAP Fields</Typography.Title></Col>
            <Col span={8}><Form.Item name="vendorCode" label="Vendor Code"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="mrp" label="MRP"><Input placeholder="e.g. 599" /></Form.Item></Col>
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
        <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ marginBottom: 12, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                        <Title level={2} style={{ margin: 0 }}>Approver Dashboard</Title>
                        <Text type="secondary">
                            Review, edit, and approve extracted articles for SAP creation.
                            {user?.division && <Text type="success" style={{ marginLeft: 8 }}>Scope: {user.division} {user.subDivision ? `(${user.subDivision})` : ''}</Text>}
                        </Text>
                    </div>
                </div>

                <Card size="small" style={{ marginBottom: 0 }}>
                    <Row gutter={[16, 16]} align="middle">
                        <Col xs={24} sm={8} md={6}>
                            <Input.Search
                                placeholder="Search Article, Vendor, Design #"
                                onSearch={val => { setSearchText(val); }}
                                allowClear
                            />
                        </Col>
                        <Col xs={24} sm={8} md={5}>
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

                        {/* Admin Filters */}
                        {user?.role === 'ADMIN' && (
                            <>
                                <Col xs={24} sm={8} md={4}>
                                    <Select
                                        style={{ width: '100%' }}
                                        placeholder="Division"
                                        value={divisionFilter}
                                        onChange={setDivisionFilter}
                                    >
                                        <Option value="ALL">All Divisions</Option>
                                        <Option value="MEN">MEN</Option>
                                        <Option value="LADIES">LADIES</Option>
                                        <Option value="KIDS">KIDS</Option>
                                    </Select>
                                </Col>
                                <Col xs={24} sm={8} md={4}>
                                    <Select
                                        style={{ width: '100%' }}
                                        placeholder="Sub-Division"
                                        value={subDivisionFilter}
                                        onChange={setSubDivisionFilter}
                                    >
                                        <Option value="ALL">All Sub-Divs</Option>
                                        {/* Ideally these should be dynamic based on Division */}
                                        <Option value="UPPER">UPPER</Option>
                                        <Option value="LOWER">LOWER</Option>
                                    </Select>
                                </Col>
                            </>
                        )}

                        <Col xs={24} sm={24} md={5} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <Button icon={<ReloadOutlined />} onClick={fetchItems}>Refresh</Button>
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={handleApprove}
                                disabled={selectedRowKeys.length === 0}
                                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                            >
                                Approve ({selectedRowKeys.length})
                            </Button>
                        </Col>
                    </Row>
                </Card>
            </div>

            <Card
                variant="borderless"
                className="shadow-sm"
                style={{ flex: 1, minHeight: 0 }}
                styles={{ body: { height: '100%', padding: 12, display: 'flex', flexDirection: 'column' } }}
            >
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ApproverTable
                        items={items}
                        loading={loading}
                        selectedRowKeys={selectedRowKeys}
                        onSelectionChange={setSelectedRowKeys}
                        onEdit={handleEdit}
                        attributes={attributes}
                        user={user}
                        tableHeight="calc(100vh - 460px)"
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
                                Object.entries(row).filter(([key, value]) => (item as any)[key] !== value)
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
                </div>
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
