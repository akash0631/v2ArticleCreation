import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Checkbox, Tag, Select, Input, Spin, Button, Tooltip } from 'antd';
import { FileTextOutlined, AppstoreAddOutlined, RocketOutlined, InfoCircleOutlined, TeamOutlined } from '@ant-design/icons';
import type { ApproverItem, MasterAttribute } from './ApproverTable';
import { getMajCatAllowedValues, getMajCatMandatoryKeys, SCHEMA_KEY_TO_EXCEL_ATTR, normalizeMajorCategory } from '../../../data/majCatAttributeMap';
import { getMajorCategoriesByDivision, getMcCodeByMajorCategory } from '../../../data/majorCategoryMcCodeMap';
import { preloadAttributeValues, getCachedValues } from '../../../services/articleConfigService';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import { APP_CONFIG } from '../../../constants/app/config';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
import VariantSubTable from './VariantSubTable';

// Module-level BOM cache: category → promise of data (shared across all card instances)
// Prevents N duplicate fetches when multiple rows share the same majorCategory.
const bomCache = new Map<string, Promise<Record<string, Record<string, string>>>>();

const fetchBomMap = (category: string): Promise<Record<string, Record<string, string>>> => {
    const existing = bomCache.get(category);
    if (existing) return existing;
    const token = localStorage.getItem('authToken');
    const p = fetch(`${APP_CONFIG.api.baseURL}/approver/bom-art-numbers/${encodeURIComponent(category)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
        .then(r => r.json())
        .then(res => (res?.data as Record<string, Record<string, string>>) ?? {})
        .catch(() => ({}));
    bomCache.set(category, p);
    return p;
};

const { Option } = Select;

// Labels derived from SCHEMA_KEY_TO_EXCEL_ATTR so they always match the Excel exactly.
const f = (schemaKey: string) => SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey] ?? schemaKey;

// Attributes grouped exactly as in the Excel mandatory grid (4 groups)
// freeText: true → renders as text input and is always visible (no dropdown/allowedValues check)
const ATTRIBUTE_GROUPS: { group: string; color: string; fields: { field: string; schemaKey: string; freeText?: boolean }[] }[] = [
    {
        group: 'FAB',
        color: '#e6f4ff',
        fields: [
            { field: 'macroMvgr',      schemaKey: 'macro_mvgr' },
            { field: 'yarn1',          schemaKey: 'yarn_01' },
            { field: 'mainMvgr',       schemaKey: 'main_mvgr' },
            { field: 'fabricMainMvgr', schemaKey: 'fabric_main_mvgr' },
            { field: 'weave',          schemaKey: 'weave' },
            { field: 'mFab2',          schemaKey: 'm_fab2' },
            { field: 'composition',    schemaKey: 'composition' },
            { field: 'fCount',         schemaKey: 'f_count' },
            { field: 'fConstruction',  schemaKey: 'f_construction' },
            { field: 'lycra',          schemaKey: 'lycra_non_lycra' },
            { field: 'finish',         schemaKey: 'finish' },
            { field: 'gsm',            schemaKey: 'gsm' },
            { field: 'fOunce',         schemaKey: 'f_ounce' },
            { field: 'fWidth',         schemaKey: 'f_width' },
            { field: 'shade',          schemaKey: 'shade',            freeText: true },
            { field: 'weight',         schemaKey: 'weight',           freeText: true },
        ],
    },
    {
        group: 'BODY',
        color: '#f6ffed',
        fields: [
            { field: 'collar',         schemaKey: 'collar' },
            { field: 'collarStyle',    schemaKey: 'collar_style' },
            { field: 'neckDetails',    schemaKey: 'neck_details' },
            { field: 'neck',           schemaKey: 'neck' },
            { field: 'placket',        schemaKey: 'placket' },
            { field: 'fatherBelt',     schemaKey: 'father_belt' },
            { field: 'sleeve',         schemaKey: 'sleeve' },
            { field: 'sleeveFold',     schemaKey: 'sleeve_fold' },
            { field: 'bottomFold',     schemaKey: 'bottom_fold' },
            { field: 'noOfPocket',     schemaKey: 'no_of_pocket' },
            { field: 'pocketType',     schemaKey: 'pocket_type' },
            { field: 'extraPocket',    schemaKey: 'extra_pocket' },
            { field: 'fit',            schemaKey: 'fit' },
            { field: 'pattern',        schemaKey: 'body_style' },
            { field: 'length',         schemaKey: 'length' },
            { field: 'childBelt',      schemaKey: 'child_belt',       freeText: true },
            { field: 'frontOpenStyle', schemaKey: 'front_open_style', freeText: true },
        ],
    },
    {
        group: 'VA ACC.',
        color: '#fff7e6',
        fields: [
            { field: 'drawcord',       schemaKey: 'drawcord' },
            { field: 'dcShape',        schemaKey: 'dc_shape' },
            { field: 'button',         schemaKey: 'button' },
            { field: 'btnColour',      schemaKey: 'btn_colour' },
            { field: 'zipper',         schemaKey: 'zipper' },
            { field: 'zipColour',      schemaKey: 'zip_colour' },
            { field: 'patchesType',    schemaKey: 'patches_type' },
            { field: 'patches',        schemaKey: 'patches' },
            { field: 'htrfType',       schemaKey: 'htrf_type' },
            { field: 'htrfStyle',      schemaKey: 'htrf_style' },
        ],
    },
    {
        group: 'VA PRCS',
        color: '#fff0f6',
        fields: [
            { field: 'printType',      schemaKey: 'print_type' },
            { field: 'printStyle',     schemaKey: 'print_style' },
            { field: 'printPlacement', schemaKey: 'print_placement' },
            { field: 'embroidery',     schemaKey: 'embroidery' },
            { field: 'embroideryType', schemaKey: 'embroidery_type' },
            { field: 'embPlacement',   schemaKey: 'emb_placement' },
            { field: 'wash',           schemaKey: 'wash' },
        ],
    },
    {
        group: 'BUSINESS',
        color: '#f9f0ff',
        fields: [
            { field: 'ageGroup',            schemaKey: 'age_group' },
            { field: 'articleFashionType',  schemaKey: 'article_fashion_type' },
            { field: 'segment',             schemaKey: 'segment' },
            { field: 'mvgrBrandVendor',     schemaKey: 'mvgr_brand_vendor', freeText: true },
        ],
    },
];

// Flat list used in useMemo — keeps group info attached (freeText flag carried through)
const ATTRIBUTE_FIELDS = ATTRIBUTE_GROUPS.flatMap(g =>
    g.fields.map(a => ({ ...a, label: f(a.schemaKey), group: g.group, groupColor: g.color, freeText: a.freeText ?? false }))
);

export interface ApproverArticleListProps {
    items: ApproverItem[];
    majorCategory: string;
    loading: boolean;
    selectedRowKeys: React.Key[];
    onSelectionChange: (keys: React.Key[]) => void;
    onEdit: (item: ApproverItem) => void;
    onSave: (item: ApproverItem, updates: Record<string, unknown>) => void;
    onCreateFabricArticle: (item: ApproverItem) => void;
    onCreateBodyArticle: (item: ApproverItem) => void;
    onProceedFGArticle: (item: ApproverItem) => void;
    attributes: MasterAttribute[];
    onRefresh: () => void;
    serverPagination: {
        total: number;
        current: number;
        pageSize: number;
        onChange: (page: number) => void;
    };
}

const getDisplayStatus = (item: ApproverItem) => {
    if (item.approvalStatus === 'REJECTED') return { label: 'REJECTED', color: '#ff4d4f' };
    if (item.sapSyncStatus === 'FAILED') return { label: 'FAILED', color: '#ff4d4f' };
    if (item.approvalStatus === 'APPROVED' && item.sapSyncStatus === 'SYNCED') return { label: 'DONE', color: '#52c41a' };
    return { label: 'PENDING', color: '#faad14' };
};

// ── Single article card ───────────────────────────────────────────────────────
const ArticleCard = React.memo(({
    item,
    isSelected,
    onToggleSelect,
    onSave,
    onCreateFabricArticle,
    onCreateBodyArticle,
    onProceedFGArticle,
    attributes,
    onRefresh,
}: {
    item: ApproverItem;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onSave: (item: ApproverItem, updates: Record<string, unknown>) => void;
    onCreateFabricArticle: (item: ApproverItem) => void;
    onCreateBodyArticle: (item: ApproverItem) => void;
    onProceedFGArticle: (item: ApproverItem) => void;
    attributes: MasterAttribute[];
    onRefresh: () => void;
}) => {
    const [showVariants, setShowVariants] = useState(false);
    const [localValues, setLocalValues] = useState<Record<string, string | null>>({});

    // When the parent item prop updates (e.g. after fetchItems or a post-save state merge),
    // drop any localValues entries whose value now matches the item prop — they're stale overrides.
    // This ensures the card always reflects the authoritative server value after a re-fetch.
    const prevItemRef = React.useRef<ApproverItem>(item);
    React.useEffect(() => {
        const prev = prevItemRef.current;
        prevItemRef.current = item;
        if (prev === item) return; // same reference — no change
        setLocalValues(local => {
            const next: Record<string, string | null> = {};
            for (const [k, v] of Object.entries(local)) {
                // Keep the override only if item didn't change for this key.
                // Once item reflects the saved value, the override is redundant.
                const itemVal = (item as any)[k] ?? null;
                const strItemVal = itemVal === null ? null : String(itemVal);
                if (strItemVal !== (v === null ? null : String(v ?? ''))) {
                    // item changed to something different from our local edit — server wins
                    // (don't keep the local override)
                } else {
                    next[k] = v;
                }
            }
            return next;
        });
    // Only run when item identity changes (reference change from setItems in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item]);

    // Normalize majorCategory: use local edit when available, otherwise fall back to item prop
    const effectiveMajCat = useMemo(() => {
        const raw = (localValues['majorCategory'] !== undefined ? localValues['majorCategory'] : item.majorCategory) || '';
        return normalizeMajorCategory(raw, item.division);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localValues['majorCategory'], item.majorCategory, item.division]);

    // Tracks when the attribute values cache has loaded so visibleAttrs re-computes
    const [cacheReady, setCacheReady] = useState(false);

    // Compute attributes per-card from this article's own majorCategory
    const { visibleAttrs, mandatoryKeys } = useMemo(() => {
        if (!effectiveMajCat) return { visibleAttrs: [], mandatoryKeys: new Set<string>() };
        const mandatory = getMajCatMandatoryKeys(effectiveMajCat);
        const visible = ATTRIBUTE_FIELDS
            .map(af => {
                // freeText fields always shown as editable text inputs (no predefined values)
                if (af.freeText) {
                    return { field: af.field, label: af.label, schemaKey: af.schemaKey, group: af.group, groupColor: af.groupColor, values: [] as { shortForm: string; fullForm: string }[], freeText: true };
                }
                // Only show dropdown fields that are mandatory for this major category
                if (!mandatory.has(af.schemaKey)) return null;
                const values = getMajCatAllowedValues(item.division || '', af.schemaKey);
                return values ? { field: af.field, label: af.label, schemaKey: af.schemaKey, group: af.group, groupColor: af.groupColor, values, freeText: false } : null;
            })
            .filter((af): af is NonNullable<typeof af> => af !== null);
        return { visibleAttrs: visible, mandatoryKeys: mandatory };
    // cacheReady is a dependency so this re-runs once the attribute cache loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveMajCat, cacheReady]);
    const [editingField, setEditingField] = useState<string | null>(null);
    // Per-attribute manual overrides for Art # (user-editable)
    const [attrArticleNums, setAttrArticleNums] = useState<Record<string, string>>(() => {
        try { return JSON.parse((item as any).attrArticleNums || '{}'); } catch { return {}; }
    });
    // BOM grid map for auto Art # lookup: { excelAttrName: { mvgrValue: sapCd } }
    const [bomMap, setBomMap] = useState<Record<string, Record<string, string>>>({});

    useEffect(() => {
        if (!item.division) return;
        preloadAttributeValues(item.division)
            .then(() => setCacheReady(true))
            .catch(() => setCacheReady(true)); // still flip so fields show (empty)
    }, [item.division]);

    useEffect(() => {
        if (!effectiveMajCat) return;
        let cancelled = false;
        fetchBomMap(effectiveMajCat).then(data => {
            if (!cancelled) setBomMap(data);
        });
        return () => { cancelled = true; };
    }, [effectiveMajCat]);

    // Compute Art # for a field: auto-lookup from bomMap, fallback to manual override
    const getArtNum = useCallback((schemaKey: string, field: string, currentValue: string | null): string => {
        const excelAttrName = SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey];
        if (excelAttrName && currentValue && bomMap[excelAttrName]?.[currentValue]) {
            return bomMap[excelAttrName][currentValue];
        }
        return attrArticleNums[field] || '';
    }, [bomMap, attrArticleNums]);

    const saveAttrArticleNum = (field: string, val: string) => {
        const updated = { ...attrArticleNums, [field]: val };
        setAttrArticleNums(updated);
        const attrUpdates = { attrArticleNums: JSON.stringify(updated) };
        onSave({ ...item, ...attrUpdates } as any, attrUpdates);
    };
    const [failedImg, setFailedImg] = useState(false);
    const [refreshedUrl, setRefreshedUrl] = useState<string | null>(null);

    const FAB_FIELDS: { field: string; schemaKey: string }[] = [
        { field: 'macroMvgr',      schemaKey: 'macro_mvgr' },
        { field: 'yarn1',          schemaKey: 'yarn_01' },
        { field: 'mainMvgr',       schemaKey: 'main_mvgr' },
        { field: 'fabricMainMvgr', schemaKey: 'fabric_main_mvgr' },
        { field: 'weave',          schemaKey: 'weave' },
        { field: 'mFab2',          schemaKey: 'm_fab2' },
        { field: 'composition',    schemaKey: 'composition' },
        { field: 'fCount',         schemaKey: 'f_count' },
        { field: 'fConstruction',  schemaKey: 'f_construction' },
        { field: 'lycra',          schemaKey: 'lycra_non_lycra' },
        { field: 'finish',         schemaKey: 'finish' },
        { field: 'gsm',            schemaKey: 'gsm' },
        { field: 'fOunce',         schemaKey: 'f_ounce' },
        { field: 'fWidth',         schemaKey: 'f_width' },
    ];
    const BODY_FIELDS: { field: string; schemaKey: string }[] = [
        { field: 'collar',      schemaKey: 'collar' },
        { field: 'collarStyle', schemaKey: 'collar_style' },
        { field: 'neckDetails', schemaKey: 'neck_details' },
        { field: 'neck',        schemaKey: 'neck' },
        { field: 'placket',     schemaKey: 'placket' },
        { field: 'fatherBelt',  schemaKey: 'father_belt' },
        { field: 'sleeve',      schemaKey: 'sleeve' },
        { field: 'sleeveFold',  schemaKey: 'sleeve_fold' },
        { field: 'bottomFold',  schemaKey: 'bottom_fold' },
        { field: 'noOfPocket',  schemaKey: 'no_of_pocket' },
        { field: 'pocketType',  schemaKey: 'pocket_type' },
        { field: 'extraPocket', schemaKey: 'extra_pocket' },
        { field: 'fit',         schemaKey: 'fit' },
        { field: 'pattern',     schemaKey: 'body_style' },
        { field: 'length',      schemaKey: 'length' },
    ];

    // Helper: get current value of a field (local edit takes priority over item)
    const getFieldVal = useCallback((field: string) => {
        const v = localValues[field] !== undefined ? localValues[field] : (item as any)[field];
        return v ? String(v).trim() : null;
    }, [localValues, item]);

    // Reactively rebuild fabric/body descriptions whenever mandatory fields or item changes.
    // Reading localValues inside the setLocalValues updater (not as a dep) breaks the
    // getFieldVal → localValues → effect → setLocalValues → localValues circular loop.
    React.useEffect(() => {
        if (item.approvalStatus !== 'PENDING') return;
        if (mandatoryKeys.size === 0) return;

        setLocalValues(prev => {
            const getVal = (field: string) => {
                const v = prev[field] !== undefined ? prev[field] : (item as any)[field];
                return v ? String(v).trim() : null;
            };

            const fabParts = FAB_FIELDS
                .filter(f => mandatoryKeys.has(f.schemaKey))
                .map(f => getVal(f.field))
                .filter(Boolean) as string[];
            const bodyParts = BODY_FIELDS
                .filter(f => mandatoryKeys.has(f.schemaKey))
                .map(f => getVal(f.field))
                .filter(Boolean) as string[];

            const newFabDesc = fabParts.length > 0 ? fabParts.join('-').slice(0, 40) : null;
            const newBodyDesc = bodyParts.length > 0 ? bodyParts.join('-').slice(0, 40) : null;

            const updates: Record<string, string | null> = {};
            if (newFabDesc !== null && newFabDesc !== prev['fabricArticleDescription']) updates['fabricArticleDescription'] = newFabDesc;
            if (newBodyDesc !== null && newBodyDesc !== prev['bodyArticleDescription']) updates['bodyArticleDescription'] = newBodyDesc;
            return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
        });
    }, [mandatoryKeys, item]);

    const isLocked = item.approvalStatus === 'APPROVED' || item.approvalStatus === 'REJECTED';
    const status = getDisplayStatus(item);

    const imgSrc = refreshedUrl || item.imageUrl;
    const imgUrl = imgSrc && !failedImg ? getImageUrl(imgSrc) : null;

    const handleImgError = useCallback(async () => {
        setFailedImg(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${APP_CONFIG.api.baseURL}/approver/image/${item.id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.url) { setRefreshedUrl(data.url); setFailedImg(false); }
        } catch { /* ignore */ }
    }, [item.id]);

    const calcMrpFromRate = (rate: number): number => Math.ceil((rate * 1.47) / 25) * 25;

    const getValue = (field: string): string | null => {
        if (field in localValues) return localValues[field];
        if (field === 'mrp') {
            const stored = (item as any).mrp;
            const storedNum = parseFloat(String(stored ?? ''));
            if ((isNaN(storedNum) || storedNum <= 1)) {
                const rate = parseFloat(String((item as any).rate ?? ''));
                if (!isNaN(rate) && rate > 0) return String(calcMrpFromRate(rate));
            }
        }
        return (item as any)[field] ?? null;
    };

    const handleSave = (field: string, value: string | null) => {
        const updates: Record<string, string | null> = { [field]: value };
        if (field === 'rate') {
            const rate = parseFloat(String(value ?? ''));
            if (!isNaN(rate) && rate > 0) {
                updates['mrp'] = String(calcMrpFromRate(rate));
            }
        }
        if (field === 'majorCategory' && value) {
            const newMcCode = getMcCodeByMajorCategory(value);
            if (newMcCode) updates['mcCode'] = newMcCode;
        }
        setLocalValues(prev => ({ ...prev, ...updates }));
        setEditingField(null);
        onSave({ ...item, ...updates } as ApproverItem, updates as Record<string, unknown>);
    };

    const borderColor = item.approvalStatus === 'APPROVED' ? '#b7eb8f'
        : item.approvalStatus === 'REJECTED' ? '#ffa39e'
        : '#e8e8e8';
    const bgColor = item.approvalStatus === 'APPROVED' ? '#f6ffed'
        : item.approvalStatus === 'REJECTED' ? '#fff1f0'
        : '#fff';

    return (
        <div style={{
            display: 'flex',
            border: `1px solid ${borderColor}`,
            borderRadius: 8,
            background: bgColor,
            marginBottom: 10,
            overflow: 'hidden',
        }}>
            {/* ── Left: checkbox + image ── */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '10px 8px',
                borderRight: '1px solid #f0f0f0',
                background: 'rgba(0,0,0,0.01)',
                flexShrink: 0,
            }}>
                <Checkbox
                    checked={isSelected}
                    disabled={item.approvalStatus === 'REJECTED'}
                    onChange={() => onToggleSelect(item.id)}
                />
                <div style={{
                    width: 72, height: 72, borderRadius: 6, overflow: 'hidden',
                    background: '#f5f5f5', flexShrink: 0,
                }}>
                    {imgUrl ? (
                        <img
                            src={imgUrl}
                            alt=""
                            width={72} height={72}
                            style={{ objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                            onError={handleImgError}
                            onClick={() => window.open(imgUrl, '_blank')}
                        />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999' }}>
                            No Img
                        </div>
                    )}
                </div>
            </div>

            {/* ── Right: header info + all attribute rows ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Header: 6 info fields horizontal, then attributes below */}
                <div style={{ padding: '6px 12px 0', borderBottom: '1px solid #f0f0f0' }}>
                    {/* Status + division on the same top line, right-aligned */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', margin: 0, background: status.color + '22', color: status.color, border: `1px solid ${status.color}44` }}>
                            {status.label}
                        </Tag>
                        {item.sapSyncMessage && (
                            <Tooltip
                                title={
                                    <span style={{ fontSize: 12 }}>
                                        <strong>SAP Remark:</strong><br />
                                        {item.sapSyncMessage}
                                    </span>
                                }
                                placement="bottomLeft"
                                overlayStyle={{ maxWidth: 420 }}
                            >
                                <InfoCircleOutlined style={{ fontSize: 13, color: status.color, cursor: 'pointer', flexShrink: 0 }} />
                            </Tooltip>
                        )}
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                            {[formatDivisionLabel(item.division), item.subDivision].filter(Boolean).join(' › ')}
                        </span>
                        <span style={{ fontSize: 11, color: '#595959', marginLeft: 'auto' }}>
                            {[item.designNumber && `Design: ${item.designNumber}`, item.vendorName].filter(Boolean).join('  ·  ')}
                            {item.rate != null && `  ·  ₹${item.rate}`}
                            {item.mrp != null && Number(item.mrp) > 1 && ` / ₹${item.mrp}`}
                        </span>
                        {item.pptNumber && (
                            <span style={{ fontSize: 10, color: '#fff', background: '#6366f1', borderRadius: 4, padding: '1px 6px', marginLeft: 6, fontWeight: 600, letterSpacing: '0.3px', flexShrink: 0 }}>
                                {item.pptNumber}
                            </span>
                        )}
                    </div>

                    {/* 6 horizontal info fields — click to edit */}
                    <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #f0f0f0' }}>
                        {([
                            { label: 'MAJOR CATEGORY',        field: 'majorCategory',              bold: true,  color: '#2f54eb',  editable: true },
                            { label: 'ARTICLE NUMBER',        field: 'articleNumber',               bold: true,  color: item.sapArticleId ? '#389e0d' : '#1d39c4', editable: !item.sapArticleId },
                            { label: 'VENDOR CODE',           field: 'vendorCode',                  bold: false, color: '#1a1a1a', editable: true },
                            { label: 'ARTICLE DESC',          field: 'articleDescription',          bold: false, color: '#595959', editable: true },
                            { label: 'REFERENCE ARTICLE',     field: 'referenceArticleNumber',      bold: false, color: '#1a1a1a', editable: true },
                            { label: 'REFERENCE ARTICLE DESC',field: 'referenceArticleDescription', bold: false, color: '#1a1a1a', editable: true },
                        ] as { label: string; field: string; bold: boolean; color: string; editable: boolean }[]).map(({ label, field, bold, color, editable }, i) => {
                            const value = field === 'articleNumber'
                                ? (item.sapArticleId || (item as any)[field])
                                : field === 'majorCategory'
                                ? effectiveMajCat || (item as any)[field]
                                : (item as any)[field];
                            const displayVal = localValues[field] !== undefined ? localValues[field] : value;
                            const isEditingThis = editingField === `hdr_${field}`;
                            const canEdit = editable && !isLocked;
                            return (
                                <div key={i} style={{
                                    flex: i >= 3 ? 2 : 1,
                                    padding: '5px 10px',
                                    borderRight: i < 5 ? '1px solid #f0f0f0' : 'none',
                                    minWidth: 0,
                                    cursor: canEdit ? 'pointer' : 'default',
                                    background: isEditingThis ? '#e6f7ff' : 'transparent',
                                }}
                                onClick={() => { if (canEdit && !isEditingThis) setEditingField(`hdr_${field}`); }}
                                >
                                    <div style={{ fontSize: 9, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2, fontWeight: 600 }}>
                                        {label}
                                    </div>
                                    {isEditingThis && field === 'majorCategory' ? (
                                        <Select
                                            autoFocus
                                            size="small"
                                            showSearch
                                            defaultOpen
                                            defaultValue={displayVal || undefined}
                                            style={{ width: '100%', fontSize: 12 }}
                                            optionFilterProp="children"
                                            onChange={(val) => handleSave(field, val || null)}
                                            onBlur={() => setEditingField(null)}
                                        >
                                            {getMajorCategoriesByDivision(item.division || '').map(cat => (
                                                <Option key={cat} value={cat}>{cat}</Option>
                                            ))}
                                        </Select>
                                    ) : isEditingThis ? (
                                        <Input
                                            autoFocus
                                            size="small"
                                            defaultValue={displayVal || ''}
                                            style={{ fontSize: 12, padding: '0 4px' }}
                                            onPressEnter={(e) => handleSave(field, (e.target as HTMLInputElement).value || null)}
                                            onBlur={(e) => handleSave(field, e.target.value || null)}
                                        />
                                    ) : (
                                        <div style={{ fontSize: 12, fontWeight: 400, color: displayVal ? color : '#bfbfbf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {displayVal || (canEdit ? 'Click to fill' : '—')}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Attribute groups — side by side columns */}
                {visibleAttrs.length > 0 ? (() => {
                    // Build a map: group → attrs
                    const groupMap: Record<string, { color: string; attrs: typeof visibleAttrs }> = {};
                    for (const attr of visibleAttrs) {
                        if (!groupMap[attr.group]) groupMap[attr.group] = { color: attr.groupColor, attrs: [] };
                        groupMap[attr.group].attrs.push(attr);
                    }
                    const activeGroups = ATTRIBUTE_GROUPS.filter(g => groupMap[g.group]);

                    // BOM fields — always shown
                    const rateVal = String(getValue('rate') ?? '').trim();
                    const mrpVal  = String(getValue('mrp')  ?? '').trim();
                    const rateNum = parseFloat(rateVal);
                    const mrpNum  = parseFloat(mrpVal);
                    const markdown = (!isNaN(rateNum) && !isNaN(mrpNum) && mrpNum > 0)
                        ? (((mrpNum - rateNum) / mrpNum) * 100).toFixed(1) + '%'
                        : '—';

                    return (
                        <div style={{ display: 'flex', borderTop: '2px solid #bfbfbf', alignItems: 'flex-start', gap: 4, padding: 4, background: '#e8e8e8' }}>
                            {activeGroups.map((g) => (
                                <div key={g.group} style={{
                                    flex: 1,
                                    minWidth: 0,
                                    border: '1.5px solid #b0b0b0',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    background: '#fff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}>
                                    {/* Group header */}
                                    <div style={{
                                        padding: '4px 10px',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: '1px',
                                        textTransform: 'uppercase',
                                        background: g.color,
                                        color: '#595959',
                                        borderBottom: '1px solid #e8e8e8',
                                    }}>
                                        {g.group}
                                    </div>
                                    {/* Attribute rows for this group */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <tbody>
                                            {groupMap[g.group].attrs.map(({ field, label, schemaKey, values, freeText }) => {
                                                const currentValue = getValue(field);
                                                // '-' counts as filled; only truly empty/null is unfilled
                                                const isEmpty = !currentValue;
                                                const isMandatory = !freeText && mandatoryKeys.has(schemaKey);
                                                const isEditing = editingField === field;
                                                const artNum = getArtNum(schemaKey, field, currentValue);
                                                const isEditingArtNum = editingField === `artnum_${field}`;
                                                return (
                                                    <tr key={field} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                                        {/* Attribute label */}
                                                        <td style={{
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            fontWeight: isMandatory ? 600 : 400,
                                                            color: isMandatory ? '#262626' : '#595959',
                                                            background: '#fafafa',
                                                            borderRight: '1px solid #f0f0f0',
                                                            whiteSpace: 'nowrap',
                                                            verticalAlign: 'middle',
                                                            maxWidth: 120,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}>
                                                            {isMandatory && <span style={{ color: '#ff4d4f', marginRight: 2 }}>*</span>}
                                                            {label}
                                                        </td>
                                                        {/* Art # column — hidden for freeText fields (no BOM lookup needed) */}
                                                        {!freeText && (
                                                            <td
                                                                style={{
                                                                    padding: '3px 6px',
                                                                    borderRight: '1px solid #f0f0f0',
                                                                    verticalAlign: 'middle',
                                                                    background: isEditingArtNum ? '#e6f7ff' : '#fafafa',
                                                                    cursor: isLocked ? 'default' : 'pointer',
                                                                    minWidth: 70,
                                                                    maxWidth: 90,
                                                                }}
                                                                onClick={() => { if (!isLocked && !isEditingArtNum) setEditingField(`artnum_${field}`); }}
                                                            >
                                                                {isEditingArtNum ? (
                                                                    <Input
                                                                        autoFocus size="small"
                                                                        defaultValue={artNum}
                                                                        style={{ fontSize: 10, padding: '0 4px', width: '100%' }}
                                                                        onPressEnter={(e) => { saveAttrArticleNum(field, (e.target as HTMLInputElement).value); setEditingField(null); }}
                                                                        onBlur={(e) => { saveAttrArticleNum(field, e.target.value); setEditingField(null); }}
                                                                    />
                                                                ) : (
                                                                    <span style={{ fontSize: 10, color: artNum ? '#1d39c4' : '#d9d9d9', fontStyle: artNum ? 'normal' : 'italic' }}>
                                                                        {artNum || 'Art #'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        )}
                                                        <td
                                                            colSpan={freeText ? 2 : 1}
                                                            style={{
                                                                padding: '3px 8px',
                                                                cursor: isLocked ? 'default' : 'pointer',
                                                                background: isEditing ? '#e6f7ff'
                                                                    : isEmpty && isMandatory ? '#fff7e6'
                                                                    : 'transparent',
                                                                verticalAlign: 'middle',
                                                            }}
                                                            onClick={() => { if (!isLocked && !isEditing) setEditingField(field); }}
                                                        >
                                                            {freeText ? (
                                                                /* Free-text: render as plain text input */
                                                                isEditing ? (
                                                                    <Input
                                                                        autoFocus
                                                                        size="small"
                                                                        defaultValue={currentValue || ''}
                                                                        style={{ fontSize: 11, width: '100%' }}
                                                                        onPressEnter={(e) => handleSave(field, (e.target as HTMLInputElement).value || null)}
                                                                        onBlur={(e) => handleSave(field, e.target.value || null)}
                                                                    />
                                                                ) : (
                                                                    <span style={{
                                                                        fontSize: 11,
                                                                        color: isEmpty ? '#bfbfbf' : '#1a1a1a',
                                                                        fontStyle: isEmpty ? 'italic' : 'normal',
                                                                    }}>
                                                                        {currentValue || '—'}
                                                                    </span>
                                                                )
                                                            ) : isEditing ? (
                                                                /* Dropdown: predefined allowed values */
                                                                <Select
                                                                    autoFocus
                                                                    showSearch
                                                                    allowClear
                                                                    open
                                                                    size="small"
                                                                    defaultValue={currentValue || undefined}
                                                                    style={{ width: '100%', minWidth: 120 }}
                                                                    optionFilterProp="children"
                                                                    onChange={(val) => handleSave(field, val ?? null)}
                                                                    onDropdownVisibleChange={(open) => { if (!open) setEditingField(null); }}
                                                                    getPopupContainer={() => document.body}
                                                                >
                                                                    {values.map(v => (
                                                                        <Option key={v.shortForm} value={v.shortForm}>{v.shortForm}</Option>
                                                                    ))}
                                                                </Select>
                                                            ) : (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <span style={{
                                                                        fontSize: 11,
                                                                        color: isEmpty ? (isMandatory ? '#fa8c16' : '#bfbfbf') : '#1a1a1a',
                                                                        fontStyle: isEmpty ? 'italic' : 'normal',
                                                                        flex: 1,
                                                                    }}>
                                                                        {currentValue || (isMandatory ? 'Required' : '—')}
                                                                    </span>
                                                                    {currentValue && !isLocked && (
                                                                        <span
                                                                            onClick={(e) => { e.stopPropagation(); handleSave(field, null); }}
                                                                            style={{ color: '#bfbfbf', fontSize: 10, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                                                                            title="Clear"
                                                                        >✕</span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* FAB group: fabric article no + desc + button */}
                                    {g.group === 'FAB' && (() => {
                                        const renderField = (field: string, label: string, autoFillFn?: () => void, maxLen?: number) => {
                                            const displayVal = localValues[field] !== undefined ? localValues[field] : (item as any)[field];
                                            const isEditingThis = editingField === `bot_${field}`;
                                            const saveVal = (raw: string | null) => {
                                                const v = raw || null;
                                                handleSave(field, maxLen && v ? v.slice(0, maxLen) : v);
                                            };
                                            return (
                                                <div
                                                    style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0', cursor: isLocked ? 'default' : 'pointer', background: isEditingThis ? '#e6f7ff' : '#fafafa' }}
                                                    onClick={() => { if (!isLocked && !isEditingThis) setEditingField(`bot_${field}`); }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                                        <span style={{ fontSize: 9, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>{label}</span>
                                                        {autoFillFn && !isLocked && <span style={{ fontSize: 9, color: '#6366f1', cursor: 'pointer', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); autoFillFn(); }}>Auto-fill</span>}
                                                    </div>
                                                    {isEditingThis ? (
                                                        <Input autoFocus size="small" defaultValue={displayVal || ''} style={{ fontSize: 11, padding: '0 4px' }}
                                                            maxLength={maxLen}
                                                            onPressEnter={(e) => saveVal((e.target as HTMLInputElement).value)}
                                                            onBlur={(e) => saveVal(e.target.value)} />
                                                    ) : (
                                                        <div style={{ fontSize: 11, color: displayVal ? '#1a1a1a' : '#bfbfbf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {displayVal || (isLocked ? '—' : 'Click to fill')}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        };
                                        const fabAutoFill = () => {
                                            const parts = FAB_FIELDS.filter(f => mandatoryKeys.has(f.schemaKey))
                                                .map(f => { const v = localValues[f.field] !== undefined ? localValues[f.field] : (item as any)[f.field]; return v ? String(v).trim() : null; })
                                                .filter(Boolean);
                                            if (parts.length > 0) handleSave('fabricArticleDescription', parts.join('-').slice(0, 40));
                                        };
                                        return (
                                            <>
                                                {renderField('fabricArticleNumber', 'FABRIC ARTICLE NO.')}
                                                {renderField('fabricArticleDescription', 'FABRIC ARTICLE DESC', fabAutoFill, 40)}
                                                <div style={{ padding: '5px 8px', borderTop: '1px solid #f0f0f0' }}>
                                                    <Button icon={<FileTextOutlined />} onClick={() => onCreateFabricArticle(item)}
                                                        style={{ background: '#e8e8ff', color: '#4b4acf', border: '1px solid #c7c7f5', fontWeight: 500, fontSize: 11, width: '100%', height: 28 }}>
                                                        Create Fabric Article
                                                    </Button>
                                                </div>
                                            </>
                                        );
                                    })()}

                                    {/* BODY group: body article no + desc + button */}
                                    {g.group === 'BODY' && (() => {
                                        const renderField = (field: string, label: string, autoFillFn?: () => void, maxLen?: number) => {
                                            const displayVal = localValues[field] !== undefined ? localValues[field] : (item as any)[field];
                                            const isEditingThis = editingField === `bot_${field}`;
                                            const saveVal = (raw: string | null) => {
                                                const v = raw || null;
                                                handleSave(field, maxLen && v ? v.slice(0, maxLen) : v);
                                            };
                                            return (
                                                <div
                                                    style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0', cursor: isLocked ? 'default' : 'pointer', background: isEditingThis ? '#e6f7ff' : '#fafafa' }}
                                                    onClick={() => { if (!isLocked && !isEditingThis) setEditingField(`bot_${field}`); }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                                        <span style={{ fontSize: 9, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>{label}</span>
                                                        {autoFillFn && !isLocked && <span style={{ fontSize: 9, color: '#6366f1', cursor: 'pointer', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); autoFillFn(); }}>Auto-fill</span>}
                                                    </div>
                                                    {isEditingThis ? (
                                                        <Input autoFocus size="small" defaultValue={displayVal || ''} style={{ fontSize: 11, padding: '0 4px' }}
                                                            maxLength={maxLen}
                                                            onPressEnter={(e) => saveVal((e.target as HTMLInputElement).value)}
                                                            onBlur={(e) => saveVal(e.target.value)} />
                                                    ) : (
                                                        <div style={{ fontSize: 11, color: displayVal ? '#1a1a1a' : '#bfbfbf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {displayVal || (isLocked ? '—' : 'Click to fill')}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        };
                                        const bodyAutoFill = () => {
                                            const parts = BODY_FIELDS.filter(f => mandatoryKeys.has(f.schemaKey))
                                                .map(f => { const v = localValues[f.field] !== undefined ? localValues[f.field] : (item as any)[f.field]; return v ? String(v).trim() : null; })
                                                .filter(Boolean);
                                            if (parts.length > 0) handleSave('bodyArticleDescription', parts.join('-').slice(0, 40));
                                        };
                                        return (
                                            <>
                                                {renderField('bodyArticle', 'BODY ARTICLE NO.')}
                                                {renderField('bodyArticleDescription', 'BODY ARTICLE DESC', bodyAutoFill, 40)}
                                                <div style={{ padding: '5px 8px', borderTop: '1px solid #f0f0f0' }}>
                                                    <Button icon={<AppstoreAddOutlined />} onClick={() => onCreateBodyArticle(item)}
                                                        style={{ background: '#f0eaff', color: '#6d3fbd', border: '1px solid #d9c8f7', fontWeight: 500, fontSize: 11, width: '100%', height: 28 }}>
                                                        Create Body Article
                                                    </Button>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            ))}

                            {/* BOM group — always shown */}
                            <div style={{ flex: 1, minWidth: 120, border: '1.5px solid #b0b0b0', borderRadius: 6, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                <div style={{
                                    padding: '4px 10px',
                                    fontSize: 10, fontWeight: 700, letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                    background: '#f9f0ff', color: '#595959',
                                    borderBottom: '1px solid #e8e8e8',
                                }}>
                                    BOM
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {[
                                            { label: 'RATE / COST',  field: 'rate',       editable: true,  mandatory: false },
                                            { label: 'MRP',          field: 'mrp',        editable: true,  mandatory: true  },
                                            { label: 'MARKDOWN',     field: '_markdown',  editable: false, mandatory: false },
                                            { label: 'IMP_ATRBT-2', field: 'impAtrbt2',  editable: true,  mandatory: true  },
                                        ].map(({ label, field, editable, mandatory }) => {
                                            const isEditingBom = editingField === `bom_${field}`;
                                            const val = field === '_markdown' ? markdown
                                                : String(getValue(field) ?? '').trim() || '—';
                                            const isEmpty = val === '—';
                                            const isDropdown = field === 'impAtrbt2';
                                            const dropdownOptions = isDropdown
                                                ? (getCachedValues(item.division ?? '', 'impAtrbt2') ?? [])
                                                : [];
                                            return (
                                                <tr key={field} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                                    <td style={{
                                                        padding: '4px 8px', fontSize: 11, fontWeight: 400,
                                                        color: mandatory && isEmpty && !isLocked ? '#ff4d4f' : '#595959',
                                                        background: '#fafafa',
                                                        borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap',
                                                        verticalAlign: 'middle',
                                                    }}>
                                                        {label}{mandatory && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '3px 8px', verticalAlign: 'middle',
                                                            cursor: editable && !isLocked ? 'pointer' : 'default',
                                                            background: isEditingBom ? '#e6f7ff' : 'transparent',
                                                        }}
                                                        onClick={() => { if (editable && !isLocked && !isEditingBom) setEditingField(`bom_${field}`); }}
                                                    >
                                                        {isEditingBom && isDropdown ? (
                                                            <Select
                                                                autoFocus
                                                                showSearch
                                                                allowClear
                                                                defaultOpen
                                                                size="small"
                                                                value={val === '—' ? undefined : val}
                                                                style={{ width: '100%', minWidth: 140 }}
                                                                optionFilterProp="children"
                                                                onSelect={(v: string) => { handleSave(field, v ?? null); }}
                                                                onClear={() => { handleSave(field, null); }}
                                                                onBlur={() => setEditingField(null)}
                                                                getPopupContainer={() => document.body}
                                                            >
                                                                {dropdownOptions.map(v => (
                                                                    <Option key={v} value={v}>{v}</Option>
                                                                ))}
                                                            </Select>
                                                        ) : isEditingBom ? (
                                                            <Input
                                                                autoFocus size="small"
                                                                defaultValue={val === '—' ? '' : val}
                                                                style={{ fontSize: 11, width: '100%' }}
                                                                onPressEnter={(e) => handleSave(field, (e.target as HTMLInputElement).value || null)}
                                                                onBlur={(e) => handleSave(field, e.target.value || null)}
                                                            />
                                                        ) : (
                                                            <span style={{
                                                                fontSize: 11,
                                                                color: field === '_markdown' ? '#7c3aed'
                                                                    : mandatory && isEmpty && !isLocked ? '#fa8c16'
                                                                    : isEmpty ? '#bfbfbf' : '#1a1a1a',
                                                                fontStyle: mandatory && isEmpty && !isLocked ? 'italic' : 'normal',
                                                                fontWeight: field === '_markdown' ? 600 : 400,
                                                            }}>
                                                                {mandatory && isEmpty && !isLocked ? 'Required' : val}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })() : (
                    <div style={{ padding: '12px 16px', color: '#8c8c8c', fontSize: 12 }}>
                        {effectiveMajCat ? `No attributes defined for ${effectiveMajCat}` : 'No major category set.'}
                    </div>
                )}

                {/* ── Proceed for FG Article Creation — only shown when article number is not yet assigned ── */}
                {!item.articleNumber && (
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #e8e8e8', background: '#fafafa' }}>
                        <Button
                            icon={<RocketOutlined />}
                            onClick={() => onProceedFGArticle(item)}
                            style={{ background: '#fff0ee', color: '#c94f44', border: '1px solid #f5c2bc', fontWeight: 600, fontSize: 13, width: '100%', height: 36 }}
                        >
                            Proceed for FG Article Creation
                        </Button>
                    </div>
                )}

                {/* ── Variants section — only for generic articles ── */}
                {item.isGeneric && (
                    <div style={{ borderTop: '1px solid #e8e8e8' }}>
                        {/* Toggle button */}
                        <div
                            style={{
                                padding: '6px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                background: showVariants ? '#e6f4ff' : '#fafafa',
                                userSelect: 'none',
                            }}
                            onClick={() => setShowVariants(v => !v)}
                        >
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1d39c4', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <TeamOutlined />
                                Variants
                            </span>
                            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                                {showVariants ? '▲ Hide' : '▼ Show'}
                            </span>
                        </div>

                        {/* Variant table — rendered only when expanded */}
                        {showVariants && (
                            <VariantSubTable
                                genericId={item.id}
                                genericRecord={item}
                                attributes={attributes}
                                onRefresh={onRefresh}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

// ── List ─────────────────────────────────────────────────────────────────────
export const ApproverArticleList: React.FC<ApproverArticleListProps> = ({
    items,
    majorCategory,
    loading,
    selectedRowKeys,
    onSelectionChange,
    onEdit: _onEdit,
    onSave,
    onCreateFabricArticle,
    onCreateBodyArticle,
    onProceedFGArticle,
    attributes,
    onRefresh,
    serverPagination,
}) => {
    // Each ArticleCard computes its own attributes from item.majorCategory directly.

    const handleToggleSelect = useCallback((id: string) => {
        onSelectionChange(
            selectedRowKeys.includes(id)
                ? selectedRowKeys.filter(k => k !== id)
                : [...selectedRowKeys, id]
        );
    }, [selectedRowKeys, onSelectionChange]);

    const handleToggleAll = useCallback(() => {
        const ids = items.filter(i => i.approvalStatus !== 'REJECTED').map(i => i.id);
        const allOn = ids.every(id => selectedRowKeys.includes(id));
        onSelectionChange(allOn ? [] : ids);
    }, [items, selectedRowKeys, onSelectionChange]);

    if (loading) {
        return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
    }

    if (items.length === 0) {
        return <div style={{ textAlign: 'center', padding: 60, color: '#8c8c8c' }}>No articles found.</div>;
    }

    const eligibleIds = items.filter(i => i.approvalStatus !== 'REJECTED').map(i => i.id);
    const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedRowKeys.includes(id));

    return (
        <div style={{ paddingBottom: 300 }}>
            {/* Select-all bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 12px', marginBottom: 8,
                background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6,
            }}>
                <Checkbox checked={allSelected} onChange={handleToggleAll}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#595959' }}>Select All on Page</span>
                </Checkbox>
                {selectedRowKeys.length > 0 && (
                    <Tag color="gold">{selectedRowKeys.length} selected</Tag>
                )}
            </div>

            {/* Cards */}
            {items.map(item => (
                <ArticleCard
                    key={item.id}
                    item={item}
                    isSelected={selectedRowKeys.includes(item.id)}
                    onToggleSelect={handleToggleSelect}
                    onSave={onSave}
                    onCreateFabricArticle={onCreateFabricArticle}
                    onCreateBodyArticle={onCreateBodyArticle}
                    onProceedFGArticle={onProceedFGArticle}
                    attributes={attributes}
                    onRefresh={onRefresh}
                />
            ))}

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {((serverPagination.current - 1) * serverPagination.pageSize) + 1}–{Math.min(serverPagination.current * serverPagination.pageSize, serverPagination.total)} of {serverPagination.total}
                </span>
                <button
                    onClick={() => serverPagination.onChange(serverPagination.current - 1)}
                    disabled={serverPagination.current <= 1}
                    style={{ border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: serverPagination.current <= 1 ? 'not-allowed' : 'pointer', opacity: serverPagination.current <= 1 ? 0.5 : 1 }}
                >‹</button>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{serverPagination.current}</span>
                <button
                    onClick={() => serverPagination.onChange(serverPagination.current + 1)}
                    disabled={serverPagination.current * serverPagination.pageSize >= serverPagination.total}
                    style={{ border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: serverPagination.current * serverPagination.pageSize >= serverPagination.total ? 'not-allowed' : 'pointer', opacity: serverPagination.current * serverPagination.pageSize >= serverPagination.total ? 0.5 : 1 }}
                >›</button>
            </div>
        </div>
    );
};
