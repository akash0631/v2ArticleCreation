import React, { useContext, useEffect, useRef, useState, useMemo } from 'react';
import { Table, Tag, Form, Input, Select, Button, Typography, Image, Modal } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
import { MAJOR_CATEGORY_ALLOWED_VALUES } from '../../../data/majorCategoryMap';

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
    finish: string | null;
    shade: string | null;
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

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
        }
    }, [editing]);

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
                        onChange={save}
                        style={{ width: '100%', minWidth: 100 }}
                    >
                        <Option value="MEN">MEN</Option>
                        <Option value="LADIES">LADIES</Option>
                        <Option value="KIDS">KIDS</Option>
                    </Select>
                ) : inputType === 'select' ? (
                    <Select
                        ref={inputRef}
                        onBlur={save}
                        onChange={save}
                        style={{ width: '100%', minWidth: 100 }}
                        showSearch
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
}

export const ApproverTable: React.FC<ApproverTableProps> = ({
    items,
    loading,
    selectedRowKeys,
    onSelectionChange,
    onEdit,
    onSave,
    attributes = [],
    user
}) => {
    const [remarksModalOpen, setRemarksModalOpen] = useState(false);
    const [activeRemarks, setActiveRemarks] = useState('');

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
            render: (_: unknown, row: ApproverItem) => (
                <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: '#f5f5f5' }}>
                    {row.imageUrl ? (
                        <Image
                            src={getImageUrl(row.imageUrl)}
                            alt={row.imageName || 'Product'}
                            width={64}
                            height={64}
                            style={{ objectFit: 'cover', cursor: 'pointer' }}
                            preview={{
                                src: getImageUrl(row.imageUrl),
                                mask: <span style={{ fontSize: 10 }}>👁 View</span>,
                            }}
                        />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 10, color: '#999' }}>No Image</span>
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Ref Details (Editable)',
            key: 'details',
            width: 200,
            fixed: 'left' as const,
            render: (_: unknown, row: ApproverItem) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {row.sapArticleId ? (
                        <Text strong style={{ color: '#389e0d' }}>{row.sapArticleId}</Text>
                    ) : (
                        <Text strong>{row.articleNumber || row.imageName || row.designNumber || 'No Article #'}</Text>
                    )}
                    {row.approvalStatus !== 'APPROVED' && (
                        <div onClick={() => onEdit(row)} style={{ cursor: 'pointer', color: '#1890ff' }}>
                            <small>Edit Division/Category</small>
                        </div>
                    )}
                    <Tag style={{ width: 'fit-content' }}>{row.vendorName || 'Unknown Vendor'}</Tag>
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
            title: 'Status',
            key: 'status',
            width: 120,
            render: (_: unknown, row: ApproverItem) => {
                const isFailed = row.sapSyncStatus === 'FAILED';
                const isDone = row.approvalStatus === 'APPROVED' && row.sapSyncStatus === 'SYNCED';

                const displayStatus = isFailed
                    ? 'FAILED'
                    : row.approvalStatus === 'REJECTED'
                        ? 'REJECTED'
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

                return (
                    <div>
                        <div
                            title={text}
                            style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: 1.3,
                                maxHeight: 84,
                                overflowY: 'auto'
                            }}
                        >
                            {text}
                        </div>
                        <Button
                            type="link"
                            size="small"
                            style={{ padding: 0, height: 'auto', marginTop: 4 }}
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
        // Core Attributes
        { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 100, editable: true },
        { title: 'Size', dataIndex: 'size', key: 'size', width: 120, editable: true },
        { title: 'Color', dataIndex: 'colour', key: 'colour', width: 120, editable: true },
        { title: 'Pattern', dataIndex: 'pattern', key: 'pattern', width: 120, editable: true },
        { title: 'Fit', dataIndex: 'fit', key: 'fit', width: 120, editable: true },

        // Fabric Details
        { title: 'Fabric Main', dataIndex: 'fabricMainMvgr', key: 'fabricMainMvgr', width: 150, editable: true },
        { title: 'Composition', dataIndex: 'composition', key: 'composition', width: 150, editable: true },
        { title: 'GSM', dataIndex: 'gsm', key: 'gsm', width: 80, editable: true },
        { title: 'Weave', dataIndex: 'weave', key: 'weave', width: 100, editable: true },

        // Extended Fabric Details
        { title: 'Yarn 1', dataIndex: 'yarn1', key: 'yarn1', width: 120, editable: true },
        { title: 'Yarn 2', dataIndex: 'yarn2', key: 'yarn2', width: 120, editable: true },
        { title: 'Finish', dataIndex: 'finish', key: 'finish', width: 120, editable: true },
        { title: 'Shade', dataIndex: 'shade', key: 'shade', width: 120, editable: true },
        { title: 'Lycra', dataIndex: 'lycra', key: 'lycra', width: 100, editable: true },
        { title: 'Wash', dataIndex: 'wash', key: 'wash', width: 120, editable: true },

        // Design Details
        { title: 'Neck', dataIndex: 'neck', key: 'neck', width: 120, editable: true },
        { title: 'Neck Details', dataIndex: 'neckDetails', key: 'neckDetails', width: 150, editable: true },
        { title: 'Sleeve', dataIndex: 'sleeve', key: 'sleeve', width: 120, editable: true },
        { title: 'Length', dataIndex: 'length', key: 'length', width: 100, editable: true },
        { title: 'Collar', dataIndex: 'collar', key: 'collar', width: 120, editable: true },
        { title: 'Placket', dataIndex: 'placket', key: 'placket', width: 120, editable: true },
        { title: 'Bottom Fold', dataIndex: 'bottomFold', key: 'bottomFold', width: 120, editable: true },
        { title: 'Front Open', dataIndex: 'frontOpenStyle', key: 'frontOpenStyle', width: 150, editable: true },

        // Accessories & Others
        { title: 'Pocket', dataIndex: 'pocketType', key: 'pocketType', width: 120, editable: true },
        { title: 'Drawcord', dataIndex: 'drawcord', key: 'drawcord', width: 100, editable: true },
        { title: 'Button', dataIndex: 'button', key: 'button', width: 100, editable: true },
        { title: 'Zipper', dataIndex: 'zipper', key: 'zipper', width: 100, editable: true },
        { title: 'Zip Color', dataIndex: 'zipColour', key: 'zipColour', width: 120, editable: true },
        { title: 'Father Belt', dataIndex: 'fatherBelt', key: 'fatherBelt', width: 120, editable: true },
        { title: 'Child Belt', dataIndex: 'childBelt', key: 'childBelt', width: 120, editable: true },

        // Prints & Embellishments
        { title: 'Print Type', dataIndex: 'printType', key: 'printType', width: 120, editable: true },
        { title: 'Print Style', dataIndex: 'printStyle', key: 'printStyle', width: 120, editable: true },
        { title: 'Print Place', dataIndex: 'printPlacement', key: 'printPlacement', width: 120, editable: true },
        { title: 'Patches', dataIndex: 'patches', key: 'patches', width: 120, editable: true },
        { title: 'Patch Type', dataIndex: 'patchesType', key: 'patchesType', width: 120, editable: true },
        { title: 'Embroidery', dataIndex: 'embroidery', key: 'embroidery', width: 120, editable: true },
        { title: 'Emb Type', dataIndex: 'embroideryType', key: 'embroideryType', width: 120, editable: true },

        // Reference
        { title: 'Ref Article', dataIndex: 'referenceArticleNumber', key: 'referenceArticleNumber', width: 150, editable: true },
        { title: 'Ref Desc', dataIndex: 'referenceArticleDescription', key: 'referenceArticleDescription', width: 200, ellipsis: true, editable: true },

        // Business & SAP Fields
        { title: 'Vendor Code', dataIndex: 'vendorCode', key: 'vendorCode', width: 130, editable: true },
        { title: 'MRP', dataIndex: 'mrp', key: 'mrp', width: 100, editable: true },
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
            width: 150,
            render: (_: unknown, row: ApproverItem) => (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Text style={{ fontSize: 13 }}>{row.userName || 'Unknown'}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(row.createdAt).toLocaleDateString()}
                    </Text>
                </div>
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


    const columns = defaultColumns.map((col) => {
        if (!col.editable) {
            return col;
        }

        // Check if this column maps to a master attribute with allowed values
        // attributes keys might be UPPERCASE or snake_case, while dataIndex is camelCase
        const attribute = attributes.find(a => {
            const key = a.key.toUpperCase();
            const colKey = String(col.dataIndex).toUpperCase();

            if (key === colKey) return true;

            // Handle specific mappings
            if (colKey === 'COLOUR' && key === 'COLOR') return true;
            if (colKey === 'MAJORCATEGORY' && key === 'MAJOR_CATEGORY') return true;
            if (colKey === 'FABRICMAINMVGR' && key === 'FABRIC') return true;
            if (colKey === 'NECKDETAILS' && key === 'NECK_DETAILS') return true;
            if (colKey === 'ZIPCOLOUR' && key === 'ZIP_COLOR') return true;
            if (colKey === 'BOTTOMFOLD' && key === 'BOTTOM_FOLD') return true;
            if (colKey === 'FRONTOPENSTYLE' && key === 'FRONT_OPEN_STYLE') return true;
            if (colKey === 'POCKETTYPE' && key === 'POCKET_TYPE') return true;
            if (colKey === 'CHILD_BELT' && key === 'CHILD_BELT_DETAIL') return true;
            if (colKey === 'CHILDBELT' && key === 'CHILD_BELT_DETAIL') return true; // Handle camelCase variations just in case

            return false;
        });

        // User requested NO dropdown for SIZE, even if it has allowed values
        const isSize = String(col.dataIndex).toUpperCase() === 'SIZE';
        const hasOptions = !isSize && attribute && attribute.allowedValues && attribute.allowedValues.length > 0;

        return {
            ...col,
            onCell: (record: ApproverItem) => {

                // Disable editing for Approved items
                if (record.approvalStatus === 'APPROVED') {
                    return {
                        record,
                        editable: false,
                        dataIndex: col.dataIndex,
                        title: col.title,
                        handleSave: () => { },
                        style: { background: '#f6ffed', cursor: 'not-allowed' } // Light green background to indicate approved/locked
                    };
                }

                // RBAC: Restrict editing for Approvers
                const field = String(col.dataIndex);
                let canEditField = col.editable;
                if (user?.role === 'APPROVER' || user?.role === 'CATEGORY_HEAD') {
                    if (field === 'division' && !!user.division) canEditField = false;
                    if (user?.role === 'APPROVER' && field === 'subDivision' && !!user.subDivision) canEditField = false;
                }

                if (!canEditField) {
                    return {
                        record,
                        editable: false,
                        dataIndex: col.dataIndex,
                        title: col.title,
                        handleSave: () => { },
                    };
                }

                // Dropdown Logic
                let inputType = hasOptions ? 'select' : 'text';
                let options = hasOptions ? attribute.allowedValues.map(v => ({ label: v.fullForm, value: v.shortForm })) : [];

                if (col.dataIndex === 'subDivision') {
                    inputType = 'select';
                    const divisionName = record.division;
                    let hierKey = '';
                    if (divisionName?.match(/MEN/i)) hierKey = 'Mens';
                    if (divisionName?.match(/LADIES|WOMEN/i)) hierKey = 'Ladies';
                    if (divisionName?.match(/KIDS/i)) hierKey = 'Kids';

                    const subDivs = SIMPLIFIED_HIERARCHY[hierKey as keyof typeof SIMPLIFIED_HIERARCHY] || [];
                    options = subDivs.map((sd: string) => ({ label: sd, value: sd }));
                }

                if (col.dataIndex === 'majorCategory') {
                    inputType = 'select';
                    const divisionName = record.division || '';
                    let prefixRegex: RegExp | null = null;

                    // Filter based on Division
                    if (divisionName.match(/MEN/i)) prefixRegex = /^M|^MW/i;
                    else if (divisionName.match(/LADIES|WOMEN/i)) prefixRegex = /^L|^LW/i;
                    else if (divisionName.match(/KIDS/i)) prefixRegex = /^(K|I|J|Y|G)/i; // Kids, Infant, Junior, Younger, Girls

                    const filtered = MAJOR_CATEGORY_ALLOWED_VALUES.filter(v => {
                        if (!prefixRegex) return true; // Show all if no division selected
                        return v.shortForm.match(prefixRegex);
                    });

                    options = filtered.map(v => ({ label: v.shortForm, value: v.shortForm }));
                }

                return {
                    record,
                    editable: col.editable,
                    dataIndex: col.dataIndex,
                    title: col.title,
                    handleSave: onSave,
                    inputType,
                    options
                };
            },
        };
    });

    return (
        <>
            <Table
                components={components}
                rowClassName={() => 'editable-row'}
                rowKey="id"
                columns={columns as any}
                dataSource={items}
                loading={loading}
                pagination={{
                    pageSize: 5,
                    showSizeChanger: true,
                    pageSizeOptions: ['5', '10', '50', '100', '200'],
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                    position: ['bottomRight'],
                }}
                scroll={{ x: 'max-content', y: 'calc(100vh - 280px)' }}
                sticky
                rowSelection={{
                    selectedRowKeys,
                    onChange: onSelectionChange,
                    getCheckboxProps: (record) => ({
                        disabled: record.approvalStatus === 'APPROVED',
                    }),
                }}
            />

            <Modal
                title="SAP Sync Remarks"
                open={remarksModalOpen}
                onCancel={() => setRemarksModalOpen(false)}
                footer={null}
                width={760}
            >
                <div
                    style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '60vh',
                        overflowY: 'auto'
                    }}
                >
                    {activeRemarks || '-'}
                </div>
            </Modal>
        </>
    );
};
