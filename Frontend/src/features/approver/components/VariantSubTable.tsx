import React, { useCallback, useEffect, useState } from 'react';
import {
    App,
    Button,
    Col,
    Form,
    Input,
    Modal,
    Popconfirm,
    Row,
    Select,
    Spin,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { APP_CONFIG } from '../../../constants/app/config';
import type { ApproverItem, MasterAttribute } from './ApproverTable';

const { Text } = Typography;
const { Option } = Select;

// Fallback used only when master attributes haven't loaded yet
const FALLBACK_COLORS = ['BLACK', 'WHITE', 'RED', 'NAVY', 'GREY', 'BLUE', 'GREEN'];

interface VariantSubTableProps {
    genericId: string;
    genericRecord: ApproverItem;
    onRefresh: () => void;
    attributes: MasterAttribute[];
    pathType?: 'old' | 'new' | 'rejected' | 'created';
}

// ── Edit variant modal ────────────────────────────────────────────────────────

interface EditVariantModalProps {
    open: boolean;
    variant: ApproverItem | null;
    attributes: MasterAttribute[];
    onClose: () => void;
    onSaved: () => void;
}

const EditVariantModal: React.FC<EditVariantModalProps> = ({
    open,
    variant,
    attributes,
    onClose,
    onSaved,
}) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open && variant) {
            form.setFieldsValue({
                variantSize: variant.variantSize,
                variantColor: variant.variantColor,
                yarn1: variant.yarn1,
                yarn2: variant.yarn2,
                weave: variant.weave,
                mFab2: variant.mFab2,
                fabricMainMvgr: variant.fabricMainMvgr,
                macroMvgr: variant.macroMvgr,
                mainMvgr: variant.mainMvgr,
                lycra: variant.lycra,
                neck: variant.neck,
                neckDetails: variant.neckDetails,
                collar: variant.collar,
                placket: variant.placket,
                sleeve: variant.sleeve,
                bottomFold: variant.bottomFold,
                frontOpenStyle: variant.frontOpenStyle,
                pocketType: variant.pocketType,
                fit: variant.fit,
                pattern: variant.pattern,
                length: variant.length,
                fatherBelt: variant.fatherBelt,
                childBelt: variant.childBelt,
                printType: variant.printType,
                printStyle: variant.printStyle,
                printPlacement: variant.printPlacement,
                embroidery: variant.embroidery,
                embroideryType: variant.embroideryType,
                patches: variant.patches,
                patchesType: variant.patchesType,
                wash: variant.wash,
                shade: variant.shade,
                composition: variant.composition,
                finish: variant.finish,
                gsm: variant.gsm,
                weight: variant.weight,
                drawcord: variant.drawcord,
                button: variant.button,
                zipper: variant.zipper,
                zipColour: variant.zipColour,
                rate: variant.rate,
                mrp: variant.mrp,
                vendorCode: variant.vendorCode,
                designNumber: variant.designNumber,
                pptNumber: variant.pptNumber,
                articleDescription: variant.articleDescription,
            });
        }
    }, [open, variant, form]);

    const handleOk = async () => {
        if (!variant) return;
        setSaving(true);
        try {
            const values = await form.validateFields();
            const token = localStorage.getItem('authToken');

            // Remove read-only size field before sending
            const { variantSize: _size, ...payload } = values;
            void _size; // suppress unused var lint

            const response = await fetch(
                `${APP_CONFIG.api.baseURL}/approver/items/${variant.id}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const payload2 = await response.json().catch(() => null);
                throw new Error(payload2?.error || 'Failed to update variant');
            }

            message.success('Variant updated');
            onSaved();
            onClose();
        } catch (err) {
            message.error(err instanceof Error ? err.message : 'Failed to update variant');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={`Edit Variant${variant?.variantSize ? ` — Size ${variant.variantSize}` : ''}`}
            open={open}
            onOk={handleOk}
            onCancel={onClose}
            okText={saving ? 'Saving…' : 'Save'}
            okButtonProps={{ loading: saving }}
            width={720}
            centered
            destroyOnHidden
        >
            <Form form={form} layout="vertical">
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="variantSize" label="Size (read-only)">
                            <Input disabled />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="variantColor" label="Color">
                            <Input placeholder="e.g. RED, NAVY BLUE" />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={12}>
                    <Col span={12}><Form.Item name="yarn1" label="Yarn 1"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="yarn2" label="Yarn 2"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="weave" label="Weave"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="mFab2" label="M FAB 2"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="fabricMainMvgr" label="Fabric Main MVGR"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="macroMvgr" label="Macro MVGR"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="mainMvgr" label="Main MVGR"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="lycra" label="Lycra"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="neck" label="Neck">
                            <Select showSearch allowClear optionFilterProp="children" placeholder="Select…">
                                {attributes.find(a => a.key === 'NECK')?.allowedValues?.map(v => (
                                    <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}><Form.Item name="neckDetails" label="Neck Details"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="collar" label="Collar"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="placket" label="Placket"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="sleeve" label="Sleeve"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="bottomFold" label="Bottom Fold"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="frontOpenStyle" label="Front Open Style"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="pocketType" label="Pocket Type"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="fit" label="Fit"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="pattern" label="Pattern"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="length" label="Length"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="fatherBelt" label="Father Belt"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="childBelt" label="Child Belt"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="wash" label="Wash"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="shade" label="Shade"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="composition" label="Composition"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="finish" label="Finish"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="gsm" label="GSM"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="weight" label="Weight"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="printType" label="Print Type"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="printStyle" label="Print Style"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="printPlacement" label="Print Placement"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="embroidery" label="Embroidery"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="embroideryType" label="Embroidery Type"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="patches" label="Patches"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="patchesType" label="Patches Type"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="drawcord" label="Drawcord"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="button" label="Button"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="zipper" label="Zipper"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="zipColour" label="Zip Colour"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="rate" label="Rate"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="mrp" label="MRP"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="vendorCode" label="Vendor Code"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="designNumber" label="Design Number"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col span={12}><Form.Item name="pptNumber" label="PPT Number"><Input /></Form.Item></Col>
                </Row>
                <Form.Item name="articleDescription" label="Article Description">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

// ── Add Color modal ───────────────────────────────────────────────────────────

interface AddColorModalProps {
    open: boolean;
    genericId: string;
    existingColors: string[];
    sizeCount: number;
    attributes: MasterAttribute[];
    onClose: () => void;
    onAdded: () => void;
}

const AddColorModal: React.FC<AddColorModalProps> = ({
    open,
    genericId,
    existingColors,
    sizeCount,
    attributes,
    onClose,
    onAdded,
}) => {
    const { message } = App.useApp();
    const [selectedColors, setSelectedColors] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    useEffect(() => {
        if (!open) { setSelectedColors([]); setDropdownOpen(false); }
    }, [open]);

    const handleOk = async () => {
        if (selectedColors.length === 0) {
            message.warning('Please select at least one color');
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(
                `${APP_CONFIG.api.baseURL}/approver/items/${genericId}/add-color`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ colors: selectedColors }),
                }
            );

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(payload?.error || 'Failed to add color variants');
            }

            const result = await response.json();
            message.success(`${result.count} variant${result.count !== 1 ? 's' : ''} created for ${selectedColors.length} color${selectedColors.length !== 1 ? 's' : ''}`);
            onAdded();
            onClose();
        } catch (err) {
            message.error(err instanceof Error ? err.message : 'Failed to add colors');
        } finally {
            setSaving(false);
        }
    };

    // Build color list from master attributes; fall back to static list if not loaded yet
    const colorAttr = attributes.find(a =>
        a.key.toUpperCase() === 'COLOR' ||
        a.key.toLowerCase() === 'colour' ||
        a.label.toUpperCase() === 'COLOR' ||
        a.label.toUpperCase() === 'COLOUR'
    );
    const colorList = colorAttr && colorAttr.allowedValues.length > 0
        ? colorAttr.allowedValues.map(v => ({ code: v.shortForm, label: v.fullForm }))
        : FALLBACK_COLORS.map(c => ({ code: c, label: c }));

    const options = colorList.map(({ code, label }) => ({
        label: label !== code ? `${code} — ${label}` : code,
        value: code,
        disabled: existingColors.some(
            ec => ec.toUpperCase() === code.toUpperCase() || ec.toUpperCase() === label.toUpperCase()
        ),
    }));

    const variantPreview = selectedColors.length > 0 && sizeCount > 0
        ? `${selectedColors.length} color${selectedColors.length > 1 ? 's' : ''} × ${sizeCount} sizes = ${selectedColors.length * sizeCount} variants`
        : null;

    return (
        <Modal
            title="Add Color Variants"
            open={open}
            onOk={handleOk}
            onCancel={onClose}
            okText={saving ? 'Adding…' : 'Add Colors'}
            okButtonProps={{ loading: saving, disabled: selectedColors.length === 0 }}
            destroyOnHidden
            width={480}
        >
            <p style={{ marginBottom: 12, color: '#555' }}>
                Select one or more colors. One variant will be created per size for each color.
            </p>

            <Select
                mode="multiple"
                showSearch
                allowClear
                placeholder="Select colors…"
                value={selectedColors}
                onChange={setSelectedColors}
                onSelect={() => setDropdownOpen(false)}
                open={dropdownOpen}
                onDropdownVisibleChange={setDropdownOpen}
                style={{ width: '100%' }}
                options={options}
                optionFilterProp="label"
                autoFocus
            />

            {variantPreview && (
                <div style={{ marginTop: 10, padding: '6px 10px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
                    <Text style={{ fontSize: 13, color: '#389e0d' }}>
                        Will create: <strong>{variantPreview}</strong>
                    </Text>
                </div>
            )}

            {existingColors.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Already added: {existingColors.map(c => <Tag key={c} style={{ marginLeft: 4 }}>{c}</Tag>)}
                    </Text>
                </div>
            )}
        </Modal>
    );
};

// ── Main VariantSubTable ──────────────────────────────────────────────────────

const VariantSubTable: React.FC<VariantSubTableProps> = ({
    genericId,
    genericRecord,
    attributes,
    onRefresh,
    pathType,
}) => {
    const { message } = App.useApp();
    const [variants, setVariants] = useState<ApproverItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [editingVariant, setEditingVariant] = useState<ApproverItem | null>(null);
    const [addColorOpen, setAddColorOpen] = useState(false);
    const [majCatSizeCount, setMajCatSizeCount] = useState<number | null>(null);

    const fetchVariants = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(
                `${APP_CONFIG.api.baseURL}/approver/items/${genericId}/variants`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch variants');
            const result = await response.json();
            setVariants(result.data || result);
        } catch {
            message.error('Failed to load variants');
        } finally {
            setLoading(false);
        }
    }, [genericId]);

    useEffect(() => {
        fetchVariants();
    }, [fetchVariants]);

    // Fetch size count from backend (accurate per ACTIVE SIZE.xlsx)
    useEffect(() => {
        const majCat = genericRecord.majorCategory;
        if (!majCat) return;
        const token = localStorage.getItem('authToken');
        fetch(`${APP_CONFIG.api.baseURL}/approver/sizes-for-majcat/${encodeURIComponent(majCat)}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(d => setMajCatSizeCount(d.count ?? null))
            .catch(() => setMajCatSizeCount(null));
    }, [genericRecord.majorCategory]);

    // Collect distinct colors already in the variant list
    const existingColors = Array.from(
        new Set(
            variants.map(v => v.variantColor).filter((c): c is string => Boolean(c))
        )
    );

    // Distinct sizes — prefer backend count (accurate per ACTIVE SIZE.xlsx); fall back to existing variants
    const sizeCount = majCatSizeCount ?? Array.from(
        new Set(variants.map(v => v.variantSize).filter(Boolean))
    ).length;

    const handleVariantSaved = useCallback(() => {
        fetchVariants();
    }, [fetchVariants]);

    const handleDeleteVariant = useCallback(async (variantId: string) => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(
                `${APP_CONFIG.api.baseURL}/approver/items/${variantId}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(payload?.error || 'Failed to delete variant');
            }
            message.success('Variant deleted');
            fetchVariants();
        } catch (err) {
            message.error(err instanceof Error ? err.message : 'Failed to delete variant');
        }
    }, [fetchVariants, onRefresh]);

    const handleRetryVariants = useCallback(async () => {
        setRetrying(true);
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(
                `${APP_CONFIG.api.baseURL}/approver/items/${genericId}/retry-variants`,
                { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Retry failed');
            message.success(data.message || `${data.synced} synced, ${data.failed} failed`);
            fetchVariants();
            onRefresh();
        } catch (err) {
            message.error(err instanceof Error ? err.message : 'Retry failed');
        } finally {
            setRetrying(false);
        }
    }, [genericId, fetchVariants, onRefresh]);

    const columns: ColumnsType<ApproverItem> = [
        {
            title: 'Size',
            dataIndex: 'variantSize',
            key: 'variantSize',
            width: 90,
            render: (v: string | null) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Color',
            dataIndex: 'variantColor',
            key: 'variantColor',
            width: 140,
            render: (v: string | null, record: ApproverItem) => {
                // Fall back: variantColor → variant's own colour → generic's colour
                const display = v || record.colour || genericRecord.colour;
                return display
                    ? <Tag color="blue">{display}</Tag>
                    : <Text type="secondary">—</Text>;
            },
        },
        {
            title: 'Status',
            dataIndex: 'approvalStatus',
            key: 'approvalStatus',
            width: 100,
            render: (status: string) => {
                const color =
                    status === 'APPROVED' ? 'green' :
                    status === 'REJECTED' ? 'red' : 'gold';
                return <Tag color={color}>{status || 'PENDING'}</Tag>;
            },
        },
        {
            title: 'Major Category',
            dataIndex: 'majorCategory',
            key: 'majorCategory',
            width: 160,
            render: (v: string | null) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Division',
            dataIndex: 'division',
            key: 'division',
            width: 100,
            render: (v: string | null) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Vendor',
            key: 'vendor',
            width: 140,
            render: (_: unknown, record: ApproverItem) =>
                record.vendorName || record.vendorCode || <Text type="secondary">—</Text>,
        },
        {
            title: 'Rate',
            dataIndex: 'rate',
            key: 'rate',
            width: 80,
            render: (v: string | number | null) => (v != null ? String(v) : '—'),
        },
        {
            title: 'MRP',
            dataIndex: 'mrp',
            key: 'mrp',
            width: 80,
            render: (v: string | number | null) => (v != null ? String(v) : '—'),
        },
        {
            title: 'SAP Article #',
            dataIndex: 'sapArticleId',
            key: 'sapArticleId',
            width: 140,
            render: (sapId: string | null, record: ApproverItem) => {
                if (sapId) {
                    return (
                        <Text strong style={{ color: '#389e0d', fontSize: 12 }}>
                            {sapId}
                        </Text>
                    );
                }
                const status = record.sapSyncStatus;
                if (status === 'FAILED') {
                    return (
                        <Tooltip title={record.sapSyncMessage || 'SAP returned an error'} placement="topLeft">
                            <Tag color="red" style={{ fontSize: 11, cursor: 'help' }}>
                                FAILED ⓘ
                            </Tag>
                        </Tooltip>
                    );
                }
                if (status === 'SYNCED') {
                    return <Tag color="orange" style={{ fontSize: 11 }}>SYNCED</Tag>;
                }
                return <Text type="secondary" style={{ fontSize: 11 }}>Pending SAP</Text>;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 130,
            render: (_: unknown, record: ApproverItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                    <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setEditingVariant(record)}
                    >
                        Edit
                    </Button>
                    {(!record.approvalStatus || record.approvalStatus === 'PENDING') && (
                        <Popconfirm
                            title="Delete variant?"
                            description="This cannot be undone."
                            onConfirm={() => handleDeleteVariant(record.id)}
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                            cancelText="Cancel"
                        >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </div>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <Spin size="small" />
                <Text type="secondary" style={{ marginLeft: 8 }}>Loading variants…</Text>
            </div>
        );
    }

    const handleSyncColor = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(
                `${APP_CONFIG.api.baseURL}/approver/items/${genericId}/sync-color`,
                { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (data.count > 0) {
                message.success(`Colour synced to ${data.count} variants`);
                fetchVariants();
            } else {
                message.info(data.message || 'Nothing to sync');
            }
        } catch {
            message.error('Failed to sync colour');
        }
    };

    return (
        <div style={{ padding: '8px 16px', background: '#fafafa', borderRadius: 6 }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 13 }}>
                    Variants ({variants.length})
                </Text>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {genericRecord.colour && (
                        <Button size="small" onClick={handleSyncColor}>
                            Sync Color
                        </Button>
                    )}
                    {/* Retry button — only on Created Articles page, only when variants need SAP sync */}
                    {pathType === 'created' && variants.some(v =>
                        v.sapSyncStatus === 'FAILED' ||
                        (v.approvalStatus === 'APPROVED' && v.sapSyncStatus === 'NOT_SYNCED') ||
                        v.approvalStatus === 'PENDING'
                    ) && (
                        <Button
                            size="small"
                            type="primary"
                            danger
                            loading={retrying}
                            onClick={handleRetryVariants}
                        >
                            {retrying ? 'Retrying…' : `Retry Variants to SAP (${variants.filter(v =>
                                v.sapSyncStatus === 'FAILED' ||
                                (v.approvalStatus === 'APPROVED' && v.sapSyncStatus === 'NOT_SYNCED') ||
                                v.approvalStatus === 'PENDING'
                            ).length})`}
                        </Button>
                    )}
                    <Button
                        size="small"
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => setAddColorOpen(true)}
                    >
                        Add Color
                    </Button>
                </div>
            </div>

            {variants.length === 0 ? (
                <Text type="secondary">No variants yet. Use "Add Color" to create color variants.</Text>
            ) : (
                <Table<ApproverItem>
                    columns={columns}
                    dataSource={variants}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    style={{ background: 'transparent' }}
                />
            )}

            <EditVariantModal
                open={!!editingVariant}
                variant={editingVariant}
                attributes={attributes}
                onClose={() => setEditingVariant(null)}
                onSaved={handleVariantSaved}
            />

            <AddColorModal
                open={addColorOpen}
                genericId={genericId}
                existingColors={existingColors}
                sizeCount={sizeCount}
                attributes={attributes}
                onClose={() => setAddColorOpen(false)}
                onAdded={handleVariantSaved}
            />
        </div>
    );
};

export default VariantSubTable;
