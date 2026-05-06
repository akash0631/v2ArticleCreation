import React, { useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { Table, Tag, Form, Input, Select, Button, Typography, Modal } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
import { MAJOR_CATEGORY_ALLOWED_VALUES } from '../../../data/majorCategoryMcCodeMap';
import { getMajCatAllowedValues } from '../../../data/majCatAttributeMap';
import { preloadAttributeValues } from '../../../services/articleConfigService';
import { APP_CONFIG } from '../../../constants/app/config';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
import './ApproverTable.css';

const { Text } = Typography;
const { Option } = Select;

export interface AttributeAllowedValue {
    id: number;
    shortForm: string;
    fullForm: string;
}

export interface MasterAttribute {
    id: number;
    key: string;
    label: string;
    allowedValues: AttributeAllowedValue[];
}

export interface ApproverItem {
    id: string;
    imageName: string | null;
    imageUrl: string | null;
    articleNumber: string | null;
    division: string | null;
    subDivision: string | null;
    majorCategory: string | null;
    vendorName: string | null;
    designNumber: string | null;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    sapSyncStatus: 'NOT_SYNCED' | 'PENDING' | 'SYNCED' | 'FAILED';
    sapSyncMessage: string | null;
    sapArticleId: string | null;
    createdAt: string;
    updatedAt: string;
    userName: string | null;
    source?: string | null;
    // Attributes
    rate: number | string | null;
    size: string | null;
    colour: string | null;
    fabricMainMvgr: string | null;
    pattern: string | null;
    fit: string | null;
    neck: string | null;
    sleeve: string | null;
    length: string | null;
    composition: string | null;
    gsm: string | null;
    wash: string | null;
    pptNumber: string | null;
    referenceArticleNumber: string | null;
    referenceArticleDescription: string | null;
    bodyArticle: string | null;
    bodyArticleDescription: string | null;
    fabricArticleNumber: string | null;
    fabricArticleDescription: string | null;
    // New business fields
    vendorCode: string | null;
    mrp: number | string | null;
    mcCode: string | null;
    segment: string | null;
    season: string | null;
    hsnTaxCode: string | null;
    articleDescription: string | null;
    fashionGrid: string | null;
    year: string | null;
    articleType: string | null;
    yarn1: string | null;
    yarn2: string | null;
    weave: string | null;
    macroMvgr: string | null;
    mainMvgr: string | null;
    mFab2: string | null;
    finish: string | null;
    shade: string | null;
    weight: string | null;
    lycra: string | null;
    neckDetails: string | null;
    collar: string | null;
    placket: string | null;
    bottomFold: string | null;
    frontOpenStyle: string | null;
    pocketType: string | null;
    drawcord: string | null;
    button: string | null;
    zipper: string | null;
    zipColour: string | null;
    printType: string | null;
    printStyle: string | null;
    printPlacement: string | null;
    patches: string | null;
    patchesType: string | null;
    embroidery: string | null;
    embroideryType: string | null;
    fatherBelt: string | null;
    childBelt: string | null;
    fCount: string | null;
    fConstruction: string | null;
    fOunce: string | null;
    fWidth: string | null;
    sleeveFold: string | null;
    noOfPocket: string | null;
    extraPocket: string | null;
    dcShape: string | null;
    btnColour: string | null;
    collarStyle: string | null;
    // BOM fields
    impAtrbt2: string | null;
    // Variant system fields
    isGeneric: boolean;
    genericArticleId: string | null;
    variantSize: string | null;
    variantColor: string | null;
}

const EditableContext = React.createContext<FormInstance<any> | null>(null);

interface EditableRowProps {
    index: number;
}

const EditableRow: React.FC<EditableRowProps> = ({ index, ...props }) => {
    const [form] = Form.useForm();
    return (
        <Form form={form} component={false}>
            <EditableContext.Provider value={form}>
                <tr {...props} />
            </EditableContext.Provider>
        </Form>
    );
};

interface EditableCellProps {
    title: React.ReactNode;
    editable: boolean;
    dataIndex: keyof ApproverItem;
    record: ApproverItem;
    handleSave: (record: ApproverItem) => void;
    children: React.ReactNode;
    inputType?: 'text' | 'select';
    options?: { label: string; value: string }[];
}



const EditableCell: React.FC<EditableCellProps> = ({
    title,
    editable,
    children,
    dataIndex,
    record,
    handleSave,
    inputType = 'text',
    options = [],
    ...restProps
}) => {
    const [editing, setEditing] = useState(false);

    const inputRef = useRef<any>(null);
    const form = useContext(EditableContext)!;
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            if (record.division) preloadAttributeValues(record.division).catch(() => {});
        }
    }, [editing]);

    useEffect(() => {
        // Cleanup timeout on unmount
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    const toggleEdit = () => {
        setEditing(!editing);
        form.setFieldsValue({ [dataIndex]: record[dataIndex] });
    };

    const save = async () => {
        try {
            const values = await form.validateFields();
            toggleEdit();
            handleSave({ ...record, ...values });
        } catch (errInfo) {
            console.log('Save failed:', errInfo);
        }
    };

    // Debounced save: wait 800ms after last input before sending request
    const debouncedSave = () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            save();
        }, 800);
    };

    let childNode = children;

    if (editable) {
        childNode = editing ? (
            <Form.Item
                style={{ margin: 0 }}
                name={dataIndex}
            >
                {dataIndex === 'division' ? (
                    <Select
                        ref={inputRef}
                        onBlur={save}
                        onChange={() => debouncedSave()}
                        allowClear
                        style={{ width: '100%', minWidth: 100 }}
                    >
                        <Option value="MEN">MENS</Option>
                        <Option value="LADIES">LADIES</Option>
                        <Option value="KIDS">KIDS</Option>
                    </Select>
                ) : dataIndex === 'lycra' ? (
                    <Select
                        ref={inputRef}
                        onBlur={save}
                        onChange={() => debouncedSave()}
                        allowClear
                        style={{ width: '100%', minWidth: 110 }}
                    >
                        <Option value="2W_LYC">2 WAY LYCRA</Option>
                        <Option value="4W_LYC">4 WAY LYCRA</Option>
                        <Option value="LCR">LYCRA</Option>
                        <Option value="N_LYC">NON LYCRA</Option>
                    </Select>
                ) : inputType === 'select' ? (
                    <Select
                        ref={inputRef}
                        onBlur={save}
                        onChange={() => { form.setFieldsValue({ [dataIndex]: form.getFieldValue(dataIndex) }); debouncedSave(); }}
                        allowClear
                        style={{ width: '100%', minWidth: 100 }}
                        showSearch
                        filterOption={(input, option) =>
                            String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                    >
                        {options.map(opt => (
                            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                        ))}
                    </Select>
                ) : (
                    <Input ref={inputRef} onPressEnter={save} onBlur={save} />
                )}
            </Form.Item>
        ) : (
            <div className="editable-cell-value_wrap" style={{ paddingRight: 24, minHeight: 32, cursor: 'pointer' }} onClick={toggleEdit}>
                {children}
            </div>
        );
    }

    return <td {...restProps}>{childNode}</td>;
};

interface ApproverTableProps {
    items: ApproverItem[];
    loading: boolean;
    selectedRowKeys: React.Key[];
    onSelectionChange: (keys: React.Key[]) => void;
    onEdit: (item: ApproverItem) => void;
    onSave: (item: ApproverItem) => void;
    attributes?: MasterAttribute[];
    user?: any;
    serverPagination?: {
        total: number;
        current: number;
        pageSize: number;
        onChange: (page: number) => void;
    };
    expandable?: import('antd/es/table').TableProps<ApproverItem>['expandable'];
}

// Returns density config based on device pixel ratio (accounts for screen DPI + browser zoom).
// ratio < 1   → zoomed out / lots of space → comfortable
// ratio 1–1.4 → standard screens           → compact
// ratio > 1.4 → zoomed in / high-DPI       → compact
const getDensity = () => {
    const ratio = window.devicePixelRatio || 1;
    if (ratio < 1) return { tableSize: 'middle' as const, imgSize: 56, padding: '4px 6px' };
    return { tableSize: 'small' as const, imgSize: 44, padding: '2px 5px' };
};

const getExtractedByLabel = (row: ApproverItem): string => {
    const source = String(row.source || '').trim().toUpperCase();
    if (source === 'WATCHER') return 'Auto';

    const userName = String(row.userName || '').trim();
    if (userName) return userName;

    return 'Auto';
};

export const ApproverTable: React.FC<ApproverTableProps> = ({
    items,
    loading,
    selectedRowKeys,
    onSelectionChange,
    onEdit,
    onSave,
    attributes = [],
    user,
    serverPagination,
    expandable,
}) => {
    const [remarksModalOpen, setRemarksModalOpen] = useState(false);
    const [activeRemarks, setActiveRemarks] = useState('');
    const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});
    const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
    const refreshAttempted = useRef<Set<string>>(new Set());
    const [density, setDensity] = useState(getDensity);

    // Re-evaluate density when browser zoom changes
    useEffect(() => {
        const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        const handler = () => setDensity(getDensity());
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Compute scroll.y = distance from the table wrapper's top edge to the viewport bottom,
    // minus: thead row (~35px) + pagination bar (~40px) + horizontal scrollbar (~16px) + buffer (8px).
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [scrollY, setScrollY] = useState<number>(500);

    const recalcScrollY = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        const available = window.innerHeight - top - 35 - 40 - 16 - 8;
        setScrollY(Math.max(200, available));
    }, []);

    useEffect(() => {
        // Run once after mount + on every resize/zoom
        recalcScrollY();
        window.addEventListener('resize', recalcScrollY);
        return () => window.removeEventListener('resize', recalcScrollY);
    }, [recalcScrollY]);

    const handleImageError = async (id: string) => {
        // If the refreshed URL also failed, give up — don't loop.
        if (refreshAttempted.current.has(id)) {
            setFailedIds(prev => new Set(prev).add(id));
            return;
        }
        refreshAttempted.current.add(id);
        setFailedIds(prev => new Set(prev).add(id));
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${APP_CONFIG.api.baseURL}/approver/image/${id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.url) {
                setRefreshedUrls(prev => ({ ...prev, [id]: data.url }));
                // Clear failedIds so the refreshed URL gets rendered
                setFailedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
            }
        } catch {
            // silently ignore — placeholder stays
        }
    };

    const components = {
        body: {
            row: EditableRow,
            cell: EditableCell,
        },
    };

    const defaultColumns = useMemo(() => [
        {
            title: 'Image',
            key: 'image',
            width: 80,
            fixed: 'left' as const,
            render: (_: unknown, row: ApproverItem) => {
                const src = refreshedUrls[row.id] || row.imageUrl;
                const url = src && !failedIds.has(row.id) ? getImageUrl(src) : null;
                return (
                    <div style={{ width: density.imgSize, height: density.imgSize, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5' }}>
                        {url ? (
                            <img
                                src={url}
                                alt={row.imageName || 'Product'}
                                width={density.imgSize}
                                height={density.imgSize}
                                loading="lazy"
                                style={{ objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                                onError={() => handleImageError(row.id)}
                                onClick={() => window.open(url, '_blank')}
                            />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 10, color: '#999' }}>No Image</span>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Ref Details (Editable)',
            key: 'details',
            width: 200,
            fixed: 'left' as const,
            render: (_: unknown, row: ApproverItem) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {row.sapArticleId ? (
                        <Text strong style={{ color: '#389e0d', fontSize: 12 }}>{row.sapArticleId}</Text>
                    ) : (
                        <Text strong style={{ fontSize: 12 }}>{row.articleNumber || row.imageName || row.designNumber || 'No Article #'}</Text>
                    )}
                    {row.approvalStatus !== 'APPROVED' && (
                        <div onClick={() => onEdit(row)} style={{ cursor: 'pointer', color: '#1890ff', fontSize: 11 }}>
                            Edit Division/Category
                        </div>
                    )}
                    <Tag style={{ width: 'fit-content', fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{row.vendorName || 'Unknown Vendor'}</Tag>
                </div>
            )
        },
        {
            title: 'Division',
            dataIndex: 'division',
            key: 'division',
            width: 120,
            editable: true,
            fixed: 'left' as const,
            render: (value: string | null) => formatDivisionLabel(value),
        },
        {
            title: 'Sub-Division',
            dataIndex: 'subDivision',
            key: 'subDivision',
            width: 120,
            editable: true,
            fixed: 'left' as const,
        },
        {
            title: 'Major Category',
            dataIndex: 'majorCategory',
            key: 'majorCategory',
            width: 150,
            editable: true,
            fixed: 'left' as const,
        },
        {
            title: 'Design Number',
            dataIndex: 'designNumber',
            key: 'designNumber',
            width: 140,
            editable: true,
        },
        {
            title: 'Status',
            key: 'status',
            width: 120,
            render: (_: unknown, row: ApproverItem) => {
                const isDone = row.approvalStatus === 'APPROVED' && row.sapSyncStatus === 'SYNCED';

                const displayStatus = row.approvalStatus === 'REJECTED'
                    ? 'REJECTED'
                    : row.sapSyncStatus === 'FAILED'
                        ? 'FAILED'
                        : isDone
                            ? 'DONE'
                            : 'PENDING';

                const color = displayStatus === 'DONE'
                    ? 'green'
                    : (displayStatus === 'FAILED' || displayStatus === 'REJECTED')
                        ? 'red'
                        : 'gold';

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Tag color={color}>{displayStatus}</Tag>
                    </div>
                );
            }
        },
        {
            title: 'Remarks',
            dataIndex: 'sapSyncMessage',
            key: 'sapSyncMessage',
            width: 320,
            render: (value: unknown) => {
                const text = value == null ? '' : String(value);
                if (!text.trim()) return '-';

                const isValidationError = text.startsWith('Validation failed');
                const lines = text.split('\n').filter(Boolean);
                const headerLine = lines[0];
                const bulletLines = lines.slice(1);

                return (
                    <div>
                        {isValidationError ? (
                            <div>
                                <div style={{ color: '#cf1322', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                                    {headerLine}
                                </div>
                                {bulletLines.slice(0, 2).map((line, i) => (
                                    <div key={i} style={{ fontSize: 11, color: '#595959', lineHeight: 1.4 }}>
                                        {line}
                                    </div>
                                ))}
                                {bulletLines.length > 2 && (
                                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                                        +{bulletLines.length - 2} more…
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.4 }}>
                                {text}
                            </div>
                        )}
                        <Button
                            type="link"
                            size="small"
                            style={{ padding: 0, height: 'auto', marginTop: 4, fontSize: 11 }}
                            onClick={() => {
                                setActiveRemarks(text);
                                setRemarksModalOpen(true);
                            }}
                        >
                            View Full
                        </Button>
                    </div>
                );
            }
        },
        { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 100, editable: true },
        { title: 'MRP', dataIndex: 'mrp', key: 'mrp', width: 100, editable: true },
        {
            title: 'Markdown',
            key: 'markdown',
            width: 110,
            editable: false,
            render: (_: unknown, record: any) => {
                const mrp = parseFloat(String(record.mrp ?? ''));
                const rate = parseFloat(String(record.rate ?? ''));
                if (!isFinite(mrp) || !isFinite(rate) || mrp === 0) return <span style={{ color: '#bfbfbf' }}>—</span>;
                const md = ((mrp - rate) / mrp * 100).toFixed(1);
                return <span style={{ color: '#2f54eb', fontWeight: 600 }}>{md}%</span>;
            }
        },
        { title: 'Size', dataIndex: 'size', key: 'size', width: 120, editable: true },

        // Business & SAP Fields
        { title: 'Vendor Code', dataIndex: 'vendorCode', key: 'vendorCode', width: 130, editable: true },
        {
            title: 'MC Code',
            dataIndex: 'mcCode',
            key: 'mcCode',
            width: 120,
            editable: true,
            render: (value: unknown) => {
                const text = value == null ? '' : String(value).trim();
                if (!text || text.toUpperCase() === 'NA' || text.toUpperCase() === 'N/A') return '';
                return text;
            }
        },
        { title: 'Segment', dataIndex: 'segment', key: 'segment', width: 120, editable: true },
        { title: 'Season', dataIndex: 'season', key: 'season', width: 120, editable: true },
        {
            title: 'HSN Tax Code',
            dataIndex: 'hsnTaxCode',
            key: 'hsnTaxCode',
            width: 140,
            editable: true,
            render: (value: unknown) => {
                const text = value == null ? '' : String(value).trim();
                if (!text || text.toUpperCase() === 'NA' || text.toUpperCase() === 'N/A') return '';
                return text;
            }
        },
        { title: 'Article Desc', dataIndex: 'articleDescription', key: 'articleDescription', width: 200, ellipsis: true, editable: true },
        { title: 'Fashion Grid', dataIndex: 'fashionGrid', key: 'fashionGrid', width: 130, editable: true },
        { title: 'Year', dataIndex: 'year', key: 'year', width: 100, editable: true },
        { title: 'Article Type', dataIndex: 'articleType', key: 'articleType', width: 130, editable: true },

        // Metadata
        { title: 'PPT #', dataIndex: 'pptNumber', key: 'pptNumber', width: 100, editable: true },
        {
            title: 'Extracted By',
            key: 'user',
            width: 130,
            render: (_: unknown, row: ApproverItem) => (
                <Text style={{ fontSize: 13 }}>{getExtractedByLabel(row)}</Text>
            )
        },
        {
            title: 'Date',
            key: 'createdAt',
            width: 110,
            render: (_: unknown, row: ApproverItem) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(row.createdAt).toLocaleDateString()}
                </Text>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 80,
            render: (_: unknown, row: ApproverItem) => (
                <Button
                    icon={<EditOutlined />}
                    onClick={() => onEdit(row)}
                    size="small"
                    disabled={row.approvalStatus === 'APPROVED'}
                >
                </Button>
            )
        }
    ], [onEdit]);


    // dataIndex (camelCase) → schema key used in getMajCatAllowedValues
    const COL_TO_SCHEMA_KEY: Record<string, string> = {
        macroMvgr: 'macro_mvgr', mainMvgr: 'main_mvgr', yarn1: 'yarn_01',
        fabricMainMvgr: 'fabric_main_mvgr', weave: 'weave', mFab2: 'm_fab2',
        composition: 'composition', finish: 'finish', gsm: 'gsm',
        lycra: 'lycra_non_lycra', pattern: 'body_style', fit: 'fit', wash: 'wash',
        neck: 'neck', neckDetails: 'neck_details', collar: 'collar', placket: 'placket',
        sleeve: 'sleeve', length: 'length', bottomFold: 'bottom_fold',
        frontOpenStyle: 'front_open_style', pocketType: 'pocket_type',
        drawcord: 'drawcord', button: 'button', zipper: 'zipper',
        zipColour: 'zip_colour', fatherBelt: 'father_belt', childBelt: 'child_belt',
        printType: 'print_type', printStyle: 'print_style', printPlacement: 'print_placement',
        patches: 'patches', patchesType: 'patches_type',
        embroidery: 'embroidery', embroideryType: 'embroidery_type',
    };

    const columns = defaultColumns.map((col) => {
        if (!col.editable) {
            return col;
        }

        return {
            ...col,
            onCell: (record: ApproverItem) => {

                if (record.approvalStatus === 'APPROVED') {
                    return { record, editable: false, dataIndex: col.dataIndex, title: col.title, handleSave: () => {}, style: { background: '#f6ffed', cursor: 'not-allowed' } };
                }

                if (record.approvalStatus === 'REJECTED') {
                    return { record, editable: false, dataIndex: col.dataIndex, title: col.title, handleSave: () => {}, style: { background: '#fff1f0', cursor: 'not-allowed' } };
                }

                const field = String(col.dataIndex);
                let canEditField = col.editable;
                if (user?.role === 'APPROVER' || user?.role === 'CATEGORY_HEAD') {
                    if (field === 'division' && !!user.division) canEditField = false;
                    if (user?.role === 'APPROVER' && field === 'subDivision' && !!user.subDivision) canEditField = false;
                }

                if (!canEditField) {
                    return { record, editable: false, dataIndex: col.dataIndex, title: col.title, handleSave: () => {} };
                }

                let inputType: 'text' | 'select' = 'text';
                let options: { label: string; value: string }[] = [];

                if (field === 'subDivision') {
                    inputType = 'select';
                    let hierKey = '';
                    if (record.division?.match(/LADIES|WOMEN/i)) hierKey = 'Ladies';
                    else if (record.division?.match(/KIDS/i)) hierKey = 'Kids';
                    else if (record.division?.match(/MEN/i)) hierKey = 'MENS';
                    options = (SIMPLIFIED_HIERARCHY[hierKey as keyof typeof SIMPLIFIED_HIERARCHY] || []).map((sd: string) => ({ label: sd, value: sd }));
                } else if (field === 'majorCategory') {
                    inputType = 'select';
                    const div = record.division || '';
                    let prefixRegex: RegExp | null = null;
                    if (div.match(/MEN/i)) prefixRegex = /^M|^MW/i;
                    else if (div.match(/LADIES|WOMEN/i)) prefixRegex = /^L|^LW/i;
                    else if (div.match(/KIDS/i)) prefixRegex = /^(K|I|J|Y|G)/i;
                    options = MAJOR_CATEGORY_ALLOWED_VALUES.filter(v => !prefixRegex || v.shortForm.match(prefixRegex)).map(v => ({ label: v.shortForm, value: v.shortForm }));
                } else {
                    // Try to get Excel-filtered values for this column based on the row's major category
                    const schemaKey = COL_TO_SCHEMA_KEY[field];
                    if (schemaKey && record.majorCategory) {
                        const excelValues = getMajCatAllowedValues(record.division || '', schemaKey);
                        if (excelValues && excelValues.length > 0) {
                            inputType = 'select';
                            options = excelValues.map(v => ({ label: v.shortForm, value: v.shortForm }));
                        }
                    }
                }

                return { record, editable: col.editable, dataIndex: col.dataIndex, title: col.title, handleSave: onSave, inputType, options };
            },
        };
    });

    return (
        <>
            <div ref={wrapperRef}>
                <Table
                    components={components}
                    className={density.tableSize === 'small' ? 'approver-compact-table' : 'approver-comfortable-table'}
                    rowClassName={() => 'editable-row'}
                    rowKey="id"
                    columns={columns as any}
                    dataSource={items}
                    loading={loading}
                    size={density.tableSize}
                    expandable={expandable}
                    pagination={serverPagination ? {
                        total: serverPagination.total,
                        current: serverPagination.current,
                        pageSize: serverPagination.pageSize,
                        onChange: serverPagination.onChange,
                        showSizeChanger: false,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                        position: ['bottomRight'],
                    } : {
                        pageSize: 50,
                        showSizeChanger: false,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                        position: ['bottomRight'],
                    }}
                    scroll={{ x: 'max-content', y: scrollY }}
                    sticky
                    rowSelection={{
                        selectedRowKeys,
                        onChange: onSelectionChange,
                        getCheckboxProps: (record) => ({
                            // APPROVED rows can be selected (for export only); REJECTED cannot
                            disabled: record.approvalStatus === 'REJECTED',
                        }),
                    }}
                />
            </div>

            <Modal
                title="SAP Sync Remarks"
                open={remarksModalOpen}
                onCancel={() => setRemarksModalOpen(false)}
                footer={null}
                width={640}
            >
                {(() => {
                    const text = activeRemarks || '';
                    if (!text) return <span style={{ color: '#8c8c8c' }}>—</span>;
                    if (!text.startsWith('Validation failed')) {
                        return (
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
                                {text}
                            </div>
                        );
                    }
                    const lines = text.split('\n').filter(Boolean);
                    const [header, ...bullets] = lines;
                    return (
                        <div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 16, padding: '8px 12px',
                                background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 6
                            }}>
                                <span style={{ color: '#cf1322', fontSize: 16 }}>✕</span>
                                <span style={{ color: '#cf1322', fontWeight: 600, fontSize: 13 }}>{header}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {bullets.map((line, i) => {
                                    const clean = line.replace(/^•\s*/, '');
                                    const colonIdx = clean.indexOf(':');
                                    const field = colonIdx > -1 ? clean.slice(0, colonIdx) : clean;
                                    const rest = colonIdx > -1 ? clean.slice(colonIdx + 1) : '';
                                    return (
                                        <div key={i} style={{
                                            padding: '8px 12px',
                                            background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6,
                                            fontSize: 12, lineHeight: 1.5
                                        }}>
                                            <span style={{ fontWeight: 600, color: '#d46b08' }}>{field}</span>
                                            <span style={{ color: '#595959' }}>:{rest}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </Modal>
        </>
    );
};
