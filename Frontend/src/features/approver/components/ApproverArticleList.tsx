import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Checkbox, Tag, Select, Input, AutoComplete, Spin, Button, Tooltip, message, Modal } from 'antd';
import { FileTextOutlined, AppstoreAddOutlined, RocketOutlined, InfoCircleOutlined, TeamOutlined, CopyOutlined } from '@ant-design/icons';
import type { ApproverItem, MasterAttribute } from './ApproverTable';
import { getMajCatAllowedValues, SCHEMA_KEY_TO_EXCEL_ATTR, SCHEMA_KEY_TO_DB_FIELD, SAP_NAME_TO_SCHEMA_KEY, normalizeMajorCategory } from '../../../data/majCatAttributeMap';
import { getMajorCategoriesByDivision, getMcCodeByMajorCategory } from '../../../data/majorCategoryMcCodeMap';
import { preloadAttributeValues, getCachedValues, isValuesCached, preloadAttributeGroups, getCachedAttributeGroups, preloadCategoryAttributes, getCachedCategoryAttributes, invalidateValuesCache, preloadMajCatGrid, isMajCatGridLoaded, getMajCatGridEntry, isMajCatInGrid, preloadMandatoryGrid, isMandatoryGridLoaded, isMandatoryGridFieldActive, isMajCatInMandatoryGrid } from '../../../services/articleConfigService';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import { APP_CONFIG } from '../../../constants/app/config';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
import { SIMPLIFIED_HIERARCHY } from '../../extraction/components/SimplifiedCategorySelector';
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

// Reverse map: schemaKey → ALL SAP keys (including legacy aliases).
// Using ALL aliases ensures isMandatoryGridFieldActive finds a match regardless of
// which SAP key variant the uploaded Excel used (e.g. NO_OF_POCKET vs M_NO_OF_POCKET).
const SCHEMA_KEY_TO_ALL_SAP_KEYS: Record<string, string[]> = Object.entries(SAP_NAME_TO_SCHEMA_KEY)
    .reduce((acc, [sapKey, schemaKey]) => {
        if (!acc[schemaKey]) acc[schemaKey] = [];
        acc[schemaKey].push(sapKey);
        return acc;
    }, {} as Record<string, string[]>);

// Attributes grouped exactly as in the Excel mandatory grid (4 groups)
// freeText: true → renders as text input and is always visible (no dropdown/allowedValues check)
const ATTRIBUTE_GROUPS: { group: string; color: string; fields: { field: string; schemaKey: string; freeText?: boolean }[] }[] = [
    {
        group: 'FABRIC',
        color: '#e6f4ff',
        fields: [
            { field: 'fabDiv',         schemaKey: 'fab_div' },
            { field: 'yarn1',          schemaKey: 'yarn_01' },
            { field: 'mainMvgr',       schemaKey: 'main_mvgr' },
            { field: 'fabricMainMvgr', schemaKey: 'fabric_main_mvgr' },
            { field: 'fabVdr',         schemaKey: 'fab_vdr' },
            { field: 'weave',          schemaKey: 'weave' },
            { field: 'mFab2',          schemaKey: 'm_fab2' },
            { field: 'fCount',         schemaKey: 'f_count' },
            { field: 'gsm',            schemaKey: 'gsm' },
            { field: 'fOunce',         schemaKey: 'f_ounce' },
            { field: 'fConstruction',  schemaKey: 'f_construction' },
            { field: 'composition',    schemaKey: 'composition' },
            { field: 'finish',         schemaKey: 'finish' },
            { field: 'fWidth',         schemaKey: 'f_width' },
            { field: 'lycra',          schemaKey: 'lycra_non_lycra' },
            { field: 'shade',          schemaKey: 'shade',           freeText: true },
            { field: 'weight',         schemaKey: 'weight',          freeText: true },
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
            { field: 'childBelt',      schemaKey: 'child_belt' },
            { field: 'sleeve',         schemaKey: 'sleeve' },
            { field: 'sleeveFold',     schemaKey: 'sleeve_fold' },
            { field: 'bottomFold',     schemaKey: 'bottom_fold' },
            { field: 'noOfPocket',     schemaKey: 'no_of_pocket' },
            { field: 'pocketType',     schemaKey: 'pocket_type' },
            { field: 'extraPocket',    schemaKey: 'extra_pocket' },
            { field: 'fit',            schemaKey: 'fit' },
            { field: 'pattern',        schemaKey: 'body_style' },
            { field: 'length',         schemaKey: 'length' },
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
            { field: 'ageGroup',           schemaKey: 'age_group' },
            { field: 'articleFashionType', schemaKey: 'article_fashion_type' },
            { field: 'impAtrbt2',          schemaKey: 'imp_atrbt2' },
            { field: 'segment',            schemaKey: 'segment',           freeText: true },
        ],
    },
];

// Builds ATTRIBUTE_GROUPS from API-driven AttributeGroupEntry list.
// Falls back to the hardcoded ATTRIBUTE_GROUPS if API returns nothing.
const GROUP_COLORS: Record<string, string> = {
    'FAB': '#e6f4ff', 'FABRIC': '#e6f4ff', 'BODY': '#f6ffed', 'VA ACC.': '#fff7e6', 'VA PRCS': '#fff0f6', 'BUSINESS': '#f9f0ff',
};
const GROUP_ORDER = ['FAB', 'FABRIC', 'BODY', 'VA ACC.', 'VA PRCS', 'BUSINESS'];

type CardGroup = typeof ATTRIBUTE_GROUPS[number];

// Schema keys that live in the BOM section only — never shown in attribute card groups
// even if they appear in the DB admin attribute list with a group assigned.
const BOM_ONLY_SCHEMA_KEYS = new Set([
    'macro_mvgr',   // IMP_ATBT-1 / macroMvgr  → BOM field
]);

function buildCardGroups(entries: { key: string; type: string; group: string }[]): CardGroup[] {
    const map = new Map<string, CardGroup['fields']>();
    for (const e of entries) {
        if (BOM_ONLY_SCHEMA_KEYS.has(e.key)) continue; // belongs to BOM, not attribute groups
        const dbField = SCHEMA_KEY_TO_DB_FIELD[e.key];
        if (!dbField) continue;
        if (!map.has(e.group)) map.set(e.group, []);
        map.get(e.group)!.push({
            field: dbField,
            schemaKey: e.key,
            freeText: e.type === 'TEXT' ? true : undefined,
        });
    }
    const built = GROUP_ORDER.filter(g => map.has(g)).map(g => ({
        group: g,
        color: GROUP_COLORS[g] || '#f0f0f0',
        fields: map.get(g)!,
    }));
    return built.length > 0 ? built : ATTRIBUTE_GROUPS;
}

export interface ApproverArticleListProps {
    items: ApproverItem[];
    majorCategory: string;
    loading: boolean;
    selectedRowKeys: React.Key[];
    onSelectionChange: (keys: React.Key[]) => void;
    onEdit: (item: ApproverItem) => void;
    onSave: (item: ApproverItem, updates: Record<string, unknown>, options?: { silent?: boolean }) => void;
    onCreateFabricArticle: (item: ApproverItem) => void;
    onCreateBodyArticle: (item: ApproverItem) => void;
    onProceedFGArticle: (item: ApproverItem) => void;
    onDuplicate: (item: ApproverItem) => Promise<void>;
    attributes: MasterAttribute[];
    onRefresh: () => void;
    pathType?: 'old' | 'new' | 'rejected' | 'created';
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
    onDuplicate,
    attributes,
    onRefresh,
    cardGroups,
    pathType,
}: {
    item: ApproverItem;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onSave: (item: ApproverItem, updates: Record<string, unknown>, options?: { silent?: boolean }) => void;
    onCreateFabricArticle: (item: ApproverItem) => void;
    onCreateBodyArticle: (item: ApproverItem) => void;
    onProceedFGArticle: (item: ApproverItem) => void;
    onDuplicate: (item: ApproverItem) => Promise<void>;
    attributes: MasterAttribute[];
    onRefresh: () => void;
    cardGroups: CardGroup[];
    pathType?: 'old' | 'new' | 'rejected' | 'created';
}) => {
    const [showVariants, setShowVariants] = useState(false);
    const [imgModalOpen, setImgModalOpen] = useState(false);
    const [localValues, setLocalValues] = useState<Record<string, string | null>>({});
    const [dupConfirmOpen, setDupConfirmOpen] = useState(false);
    const [duplicating, setDuplicating] = useState(false);

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

    // Auto-persist MRP when it is null in DB but rate is present.
    // Guards: PENDING only, user must own the article's division (prevents 403 division-mismatch loop).
    React.useEffect(() => {
        if (item.approvalStatus === 'APPROVED' || item.approvalStatus === 'REJECTED') return;

        // Only save if the current user can edit this article (division match or ADMIN)
        try {
            const raw = localStorage.getItem('user');
            if (raw) {
                const u = JSON.parse(raw);
                if (u.role !== 'ADMIN' && u.division && item.division && u.division !== item.division) return;
            }
        } catch { /* ignore parse errors */ }

        const storedMrp = parseFloat(String((item as any).mrp ?? ''));
        const rate = parseFloat(String((item as any).rate ?? ''));
        if (isNaN(rate) || rate <= 0) return;
        const calculatedMrp = Math.ceil((rate * 1.47) / 25) * 25;
        // Skip if MRP is already saved and matches what we'd calculate — no API call needed
        if (!isNaN(storedMrp) && storedMrp > 0 && storedMrp === calculatedMrp) return;
        // Skip if MRP is already saved as any valid positive number (user may have set it manually)
        if (!isNaN(storedMrp) && storedMrp > 0) return;
        const calculated = String(calculatedMrp);
        setLocalValues(prev => ({ ...prev, mrp: calculated }));
        onSave({ ...item, mrp: calculated } as ApproverItem, { mrp: calculated }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    // Normalize majorCategory: use local edit when available, otherwise fall back to item prop
    const effectiveMajCat = useMemo(() => {
        const raw = (localValues['majorCategory'] !== undefined ? localValues['majorCategory'] : item.majorCategory) || '';
        return normalizeMajorCategory(raw, item.division);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localValues['majorCategory'], item.majorCategory, item.division]);

    // Tracks when the attribute values cache has loaded so visibleAttrs re-computes
    const [cacheReady, setCacheReady] = useState(false);
    // Tracks when per-category enabled/required config has loaded
    const [catConfigReady, setCatConfigReady] = useState(false);
    // Tracks when the major-category grid JSON (uploaded Excel) has loaded
    const [gridReady, setGridReady] = useState(() => isMajCatGridLoaded());
    // Tracks when the mandatory grid (visibility config) has loaded
    const [mandatoryGridReady, setMandatoryGridReady] = useState(() => isMandatoryGridLoaded());

    // Flat attribute list derived from the active card groups
    const attributeFields = useMemo(() =>
        cardGroups.flatMap(g =>
            g.fields.map(a => ({ ...a, label: f(a.schemaKey), group: g.group, groupColor: g.color, freeText: a.freeText ?? false }))
        ),
    [cardGroups]);

    // Compute attributes per-card from this article's own majorCategory.
    //
    // 3-tier visibility (applied once either grid is loaded):
    //   MANDATORY  — Mandatory Grid = 1   → shown with bold label + * (required for approve)
    //   OPTIONAL   — Maj-Cat Grid has dropdown values for this major category → shown plain (not required)
    //   HIDDEN     — neither grid has this field for this major category → not shown at all
    //
    // While grids are still loading: show all fields as fallback.
    // mandatoryKeys — schemaKeys of MANDATORY fields only (used for auto-fill logic).
    const { visibleAttrs, mandatoryKeys } = useMemo(() => {
        if (!effectiveMajCat) return { visibleAttrs: [], mandatoryKeys: new Set<string>() };

        type AttrValue = { shortForm: string; fullForm: string };
        const visible: Array<{ field: string; label: string; schemaKey: string; group: string; groupColor: string; values: AttrValue[]; freeText: boolean; isMandatory: boolean }> = [];
        const mandatory = new Set<string>();

        // At least one grid must be ready before we apply filtering.
        // While loading, show everything so the card doesn't look broken.
        const gridsReady = gridReady || mandatoryGridReady;

        // ── Graceful degradation: if the major category has NO entries in EITHER grid
        // (e.g. not yet configured in the admin panel), fall back to showing ALL fields.
        // This prevents a blank card for categories that haven't been set up yet.
        // Uses direct category key-existence checks — reliable regardless of field name variations.
        const catHasAnyGridData = gridsReady && (
            (mandatoryGridReady && isMajCatInMandatoryGrid(effectiveMajCat)) ||
            (gridReady && isMajCatInGrid(effectiveMajCat))
        );

        for (const af of attributeFields) {
            // BOM-only fields never appear in attribute groups
            if (BOM_ONLY_SCHEMA_KEYS.has(af.schemaKey)) continue;

            // freeText fields (shade, weight, segment…) are always visible.
            // They CAN be mandatory if the mandatory grid marks them as active — check the grid.
            if (af.freeText) {
                const sapKeys = SCHEMA_KEY_TO_ALL_SAP_KEYS[af.schemaKey] ?? [];
                const isMandatory = gridsReady && catHasAnyGridData && mandatoryGridReady &&
                    sapKeys.some(sk => isMandatoryGridFieldActive(effectiveMajCat, sk) === true);
                if (isMandatory) mandatory.add(af.schemaKey);
                visible.push({ field: af.field, label: af.label, schemaKey: af.schemaKey, group: af.group, groupColor: af.groupColor, values: [], freeText: true, isMandatory });
                continue;
            }

            // Dropdown values always come from Maj-Cat Grid
            const values: AttrValue[] = getMajCatAllowedValues(effectiveMajCat, af.schemaKey, item.division || undefined) ?? [];

            if (gridsReady && catHasAnyGridData) {
                // ── Grids loaded AND category is configured: apply 3-tier filtering ──
                // Check ALL SAP key aliases — uploaded Excel may use any variant
                // (e.g. M_NO_OF_POCKET vs NO_OF_POCKET, M_COLLAR vs M_COLLAR_TYPE)
                const sapKeys = SCHEMA_KEY_TO_ALL_SAP_KEYS[af.schemaKey] ?? [];
                const isActiveMandatory = mandatoryGridReady && sapKeys.some(
                    sk => isMandatoryGridFieldActive(effectiveMajCat, sk) === true
                );

                const excelAttr = SCHEMA_KEY_TO_EXCEL_ATTR[af.schemaKey];
                const hasDropdownValues = (gridReady && excelAttr)
                    ? (getMajCatGridEntry(effectiveMajCat, excelAttr)?.length ?? 0) > 0
                    : false;

                if (isActiveMandatory) {
                    // TIER 1: Mandatory — bold + * in card, required for approve
                    mandatory.add(af.schemaKey);
                    visible.push({ field: af.field, label: af.label, schemaKey: af.schemaKey, group: af.group, groupColor: af.groupColor, values, freeText: false, isMandatory: true });
                } else if (hasDropdownValues) {
                    // TIER 2: Optional — has dropdown values but not mandatory
                    visible.push({ field: af.field, label: af.label, schemaKey: af.schemaKey, group: af.group, groupColor: af.groupColor, values, freeText: false, isMandatory: false });
                }
                // TIER 3: Neither → skip (completely hidden for configured categories)
            } else {
                // ── Grids not yet loaded OR category has no grid data (not configured yet):
                // show all fields as graceful fallback ──
                visible.push({ field: af.field, label: af.label, schemaKey: af.schemaKey, group: af.group, groupColor: af.groupColor, values, freeText: false, isMandatory: false });
            }
        }

        return { visibleAttrs: visible, mandatoryKeys: mandatory };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveMajCat, cacheReady, catConfigReady, gridReady, mandatoryGridReady, attributeFields, localValues]);
    const [editingField, setEditingField] = useState<string | null>(null);

    // Vendor name autocomplete state
    const [vendorOptions, setVendorOptions] = useState<{ value: string; label: React.ReactNode; vendorCode: string; vendorName: string }[]>([]);
    const [vendorSearching, setVendorSearching] = useState(false);
    const vendorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Per-attribute manual overrides for Art # (user-editable)
    const [attrArticleNums, setAttrArticleNums] = useState<Record<string, string>>(() => {
        try { return JSON.parse((item as any).attrArticleNums || '{}'); } catch { return {}; }
    });
    // BOM grid map for auto Art # lookup: { excelAttrName: { mvgrValue: sapCd } }
    const [bomMap, setBomMap] = useState<Record<string, Record<string, string>>>({});

    useEffect(() => {
        if (!item.division) return;
        // If cache exists but is missing impAtrbt2, it was built from a stale backend
        // response (before the imp_atrbt2→impAtrbt2 mapping fix). Invalidate and re-fetch.
        if (isValuesCached(item.division) && getCachedValues(item.division, 'impAtrbt2') === null) {
            invalidateValuesCache(item.division);
        }
        preloadAttributeValues(item.division)
            .then(() => setCacheReady(true))
            .catch(() => setCacheReady(true));
    }, [item.division]);

    // Preload major-category grid (dropdown values Excel) once per session
    useEffect(() => {
        if (isMajCatGridLoaded()) { setGridReady(true); return; }
        preloadMajCatGrid()
            .then(() => setGridReady(true))
            .catch(() => setGridReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Preload mandatory grid (field visibility Excel) once per session
    useEffect(() => {
        if (isMandatoryGridLoaded()) { setMandatoryGridReady(true); return; }
        preloadMandatoryGrid()
            .then(() => setMandatoryGridReady(true))
            .catch(() => setMandatoryGridReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!effectiveMajCat) return;
        // Check cache first to avoid a flash
        if (getCachedCategoryAttributes(effectiveMajCat)) {
            setCatConfigReady(true);
            return;
        }
        preloadCategoryAttributes(effectiveMajCat)
            .then(() => setCatConfigReady(true))
            .catch(() => setCatConfigReady(true));
    }, [effectiveMajCat]);

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
    // Prevent infinite retry: only attempt a signed-URL refresh once per card mount.
    const refreshAttempted = React.useRef(false);

    const FAB_FIELDS = useMemo(() =>
        (cardGroups.find(g => g.group === 'FAB' || g.group === 'FABRIC')?.fields ?? []).filter(f => !f.freeText),
    [cardGroups]);
    const BODY_FIELDS = useMemo(() =>
        (cardGroups.find(g => g.group === 'BODY')?.fields ?? []).filter(f => !f.freeText),
    [cardGroups]);

    // Helper: get current value of a field (local edit takes priority over item)
    const getFieldVal = useCallback((field: string) => {
        const v = localValues[field] !== undefined ? localValues[field] : (item as any)[field];
        return v ? String(v).trim() : null;
    }, [localValues, item]);

    // Reactively rebuild fabric/body descriptions whenever visible fields or item changes.
    React.useEffect(() => {
        if (item.approvalStatus !== 'PENDING') return;

        setLocalValues(prev => {
            const getVal = (field: string) => {
                const v = prev[field] !== undefined ? prev[field] : (item as any)[field];
                return v ? String(v).trim() : null;
            };

            const fabParts = FAB_FIELDS
                .map(f => getVal(f.field))
                .filter(Boolean) as string[];
            const bodyParts = BODY_FIELDS
                .map(f => getVal(f.field))
                .filter(Boolean) as string[];

            const newFabDesc = fabParts.length > 0 ? fabParts.join('-').slice(0, 40) : null;
            const newBodyDesc = bodyParts.length > 0 ? bodyParts.join('-').slice(0, 40) : null;

            const updates: Record<string, string | null> = {};
            if (newFabDesc !== null && newFabDesc !== prev['fabricArticleDescription']) updates['fabricArticleDescription'] = newFabDesc;
            if (newBodyDesc !== null && newBodyDesc !== prev['bodyArticleDescription']) updates['bodyArticleDescription'] = newBodyDesc;
            return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
        });
    }, [item]);

    const isLocked = item.approvalStatus === 'APPROVED' || item.approvalStatus === 'REJECTED';
    const status = getDisplayStatus(item);

    // Division is non-editable for APPROVER/CATEGORY_HEAD users who are locked to a specific division
    const canEditDivision = useMemo(() => {
        if (isLocked) return false;
        try {
            const raw = localStorage.getItem('user');
            if (raw) {
                const u = JSON.parse(raw);
                if ((u.role === 'APPROVER' || u.role === 'CATEGORY_HEAD') && !!u.division) return false;
            }
        } catch { /* ignore */ }
        return true;
    }, [isLocked]);

    const imgSrc = refreshedUrl || item.imageUrl;
    const imgUrl = imgSrc && !failedImg ? getImageUrl(imgSrc) : null;

    const handleImgError = useCallback(async () => {
        // If the refreshed URL also failed, give up — don't loop.
        if (refreshAttempted.current) {
            setFailedImg(true);
            return;
        }
        refreshAttempted.current = true;
        // Hide first so we can remount <img> with the refreshed URL (forces browser re-fetch).
        setFailedImg(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${APP_CONFIG.api.baseURL}/approver/image/${item.id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.url) {
                // Non-signed public URLs: add cache-bust so remounted <img> re-fetches.
                // Signed URLs (X-Amz-Signature) must not be modified.
                const base = data.url as string;
                const freshUrl = base.includes('X-Amz-Signature')
                    ? base
                    : base + (base.includes('?') ? '&' : '?') + '_cb=' + Date.now();
                setRefreshedUrl(freshUrl);
                setFailedImg(false);
            }
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

    const searchVendors = (q: string) => {
        if (vendorDebounceRef.current) clearTimeout(vendorDebounceRef.current);
        if (!q || q.trim().length < 2) { setVendorOptions([]); return; }
        vendorDebounceRef.current = setTimeout(async () => {
            setVendorSearching(true);
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch(
                    `${APP_CONFIG.api.baseURL}/approver/vendor-search?q=${encodeURIComponent(q.trim())}`,
                    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
                );
                const json = await res.json();
                const opts = (json.data ?? []).map((v: { vendorCode: string; vendorName: string; vendorCity?: string }) => ({
                    // Use "NAME||CODE" as value so duplicates with same name are distinguishable.
                    // onSelect strips the code suffix before saving the actual vendor name.
                    value: `${v.vendorName}||${v.vendorCode}`,
                    vendorCode: v.vendorCode,
                    vendorName: v.vendorName,
                    label: (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 500 }}>{v.vendorName}</span>
                            <span style={{ color: '#8c8c8c', fontSize: 11 }}>
                                {v.vendorCode}{v.vendorCity ? ` · ${v.vendorCity}` : ''}
                            </span>
                        </div>
                    ),
                }));
                setVendorOptions(opts);
            } catch {
                setVendorOptions([]);
            } finally {
                setVendorSearching(false);
            }
        }, 300);
    };

    const handleSave = (field: string, value: string | null) => {
        if (field === 'vendorCode' && value) {
            const trimmed = value.trim();
            if (!/^\d{6}$/.test(trimmed)) {
                message.error('Vendor Code must be exactly 6 digits');
                setEditingField(null);
                return;
            }
        }
        if (field === 'vendorName' && !value?.trim()) {
            message.error('Vendor Name is required');
            setEditingField(null);
            return;
        }
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
        <>
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
                            onClick={() => setImgModalOpen(true)}
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
                                    <div style={{ fontSize: 12, color: '#1a1a1a', maxHeight: 260, overflowY: 'auto' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6, color: '#cf1322', fontSize: 13 }}>
                                            ⚠ SAP Remark
                                        </div>
                                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                            {item.sapSyncMessage}
                                        </div>
                                    </div>
                                }
                                placement="bottomLeft"
                                color="#fff"
                                overlayStyle={{ maxWidth: 480, zIndex: 9999 }}
                                overlayInnerStyle={{
                                    background: '#fff',
                                    border: '1px solid #ffccc7',
                                    borderRadius: 8,
                                    boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
                                    padding: '10px 14px',
                                }}
                                getPopupContainer={() => document.body}
                            >
                                <InfoCircleOutlined style={{ fontSize: 14, color: '#cf1322', cursor: 'pointer', flexShrink: 0 }} />
                            </Tooltip>
                        )}
                        <span style={{ fontSize: 11, color: '#8c8c8c', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {/* ── Editable Division ── */}
                            {editingField === 'topbar_division' ? (
                                <Select
                                    autoFocus
                                    open
                                    size="small"
                                    value={(localValues['division'] ?? item.division) || undefined}
                                    placeholder="Select division"
                                    style={{ fontSize: 11, width: 110 }}
                                    onChange={(val) => {
                                        // Changing division resets subDivision (no longer valid)
                                        const updates = { division: val || null, subDivision: null as string | null };
                                        setLocalValues(prev => ({ ...prev, ...updates }));
                                        setEditingField(null);
                                        onSave({ ...item, ...updates } as ApproverItem, updates as Record<string, unknown>);
                                    }}
                                    onBlur={() => setEditingField(null)}
                                    onClick={(e) => e.stopPropagation()}
                                    getPopupContainer={() => document.body}
                                >
                                    <Option value="LADIES">LADIES</Option>
                                    <Option value="MENS">MENS</Option>
                                    <Option value="KIDS">KIDS</Option>
                                </Select>
                            ) : (
                                <span
                                    style={{
                                        cursor: canEditDivision ? 'pointer' : 'default',
                                        borderBottom: canEditDivision ? '1px dashed #d9d9d9' : 'none',
                                        color: (localValues['division'] ?? item.division) ? '#8c8c8c' : '#bfbfbf',
                                        fontStyle: (localValues['division'] ?? item.division) ? 'normal' : 'italic',
                                    }}
                                    onClick={() => { if (canEditDivision) setEditingField('topbar_division'); }}
                                >
                                    {formatDivisionLabel(localValues['division'] ?? item.division) || (canEditDivision ? 'set division' : '—')}
                                </span>
                            )}
                            <span style={{ color: '#bfbfbf' }}> › </span>
                            {editingField === 'topbar_subDivision' ? (
                                <Select
                                    autoFocus
                                    open
                                    size="small"
                                    value={(localValues['subDivision'] ?? item.subDivision) || undefined}
                                    placeholder="Select sub-division"
                                    style={{ fontSize: 11, width: 120 }}
                                    onChange={(val) => handleSave('subDivision', val || null)}
                                    onBlur={() => setEditingField(null)}
                                    onClick={(e) => e.stopPropagation()}
                                    getPopupContainer={() => document.body}
                                >
                                    {(() => {
                                        const effectiveDiv = (localValues['division'] ?? item.division) || '';
                                        let hierKey = '';
                                        if (effectiveDiv.match(/LADIES|WOMEN/i)) hierKey = 'Ladies';
                                        else if (effectiveDiv.match(/KIDS/i)) hierKey = 'Kids';
                                        else if (effectiveDiv.match(/MEN/i)) hierKey = 'MENS';
                                        return (SIMPLIFIED_HIERARCHY[hierKey] || []).map((sd: string) => (
                                            <Option key={sd} value={sd}>{sd}</Option>
                                        ));
                                    })()}
                                </Select>
                            ) : (
                                <span
                                    style={{
                                        cursor: isLocked ? 'default' : 'pointer',
                                        borderBottom: isLocked ? 'none' : '1px dashed #d9d9d9',
                                        color: (localValues['subDivision'] ?? item.subDivision) ? '#8c8c8c' : '#bfbfbf',
                                        fontStyle: (localValues['subDivision'] ?? item.subDivision) ? 'normal' : 'italic',
                                    }}
                                    onClick={() => { if (!isLocked) setEditingField('topbar_subDivision'); }}
                                >
                                    {(localValues['subDivision'] ?? item.subDivision) || (isLocked ? '—' : 'set sub-div')}
                                </span>
                            )}
                        </span>
                        <span style={{ fontSize: 11, color: '#595959', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {/* Editable Design No inline */}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ color: '#8c8c8c', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Design:</span>
                                {editingField === 'topbar_designNumber' ? (
                                    <Input
                                        autoFocus
                                        size="small"
                                        defaultValue={(localValues['designNumber'] ?? item.designNumber) || ''}
                                        style={{ fontSize: 11, width: 100, padding: '0 4px', height: 20 }}
                                        onPressEnter={(e) => handleSave('designNumber', (e.target as HTMLInputElement).value || null)}
                                        onBlur={(e) => handleSave('designNumber', e.target.value || null)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span
                                        style={{ color: '#8c8c8c', fontWeight: 500, cursor: isLocked ? 'default' : 'pointer', borderBottom: isLocked ? 'none' : '1px dashed #d9d9d9' }}
                                        onClick={() => { if (!isLocked) setEditingField('topbar_designNumber'); }}
                                    >
                                        {(localValues['designNumber'] ?? item.designNumber) || (isLocked ? '—' : 'Click to fill')}
                                    </span>
                                )}
                            </span>
                            <span style={{ color: '#d9d9d9' }}>·</span>
                            {item.vendorName}
                            {item.rate != null && `  ·  ₹${item.rate}`}
                            {item.mrp != null && Number(item.mrp) > 1 && ` / ₹${item.mrp}`}
                            {(pathType === 'created' ? item.updatedAt : item.createdAt) && (
                                <span style={{ marginLeft: 4, color: '#8c8c8c' }}>
                                    · {new Date((pathType === 'created' ? item.updatedAt : item.createdAt)!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            )}
                        </span>
                        {item.pptNumber && (
                            <span style={{ fontSize: 10, color: '#fff', background: '#6366f1', borderRadius: 4, padding: '1px 6px', marginLeft: 6, fontWeight: 600, letterSpacing: '0.3px', flexShrink: 0 }}>
                                {item.pptNumber}
                            </span>
                        )}
                        {/* Duplicate button — only for KIDS division, PENDING status, New Articles page */}
                        {pathType === 'new' &&
                            item.approvalStatus === 'PENDING' &&
                            item.division?.toUpperCase() === 'KIDS' && (
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => setDupConfirmOpen(true)}
                                style={{ marginLeft: 8, fontSize: 11, height: 22, padding: '0 8px', flexShrink: 0, background: '#e6f7ff', color: '#0958d9', border: '1px solid #91caff' }}
                            >
                                Duplicate
                            </Button>
                        )}
                    </div>

                    {/* 6 horizontal info fields — click to edit */}
                    <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #f0f0f0' }}>
                        {([
                            { label: 'MAJOR CATEGORY',        field: 'majorCategory',              bold: true,  color: '#2f54eb',  editable: true,  required: false },
                            { label: 'ARTICLE NUMBER',        field: 'articleNumber',               bold: true,  color: item.sapArticleId ? '#389e0d' : '#1d39c4', editable: !item.sapArticleId, required: false },
                            { label: 'VENDOR CODE',           field: 'vendorCode',                  bold: false, color: '#1a1a1a', editable: true,  required: true  },
                            { label: 'VENDOR NAME',           field: 'vendorName',                  bold: false, color: '#1a1a1a', editable: true,  required: true  },
                            { label: 'ARTICLE DESC',          field: 'articleDescription',          bold: false, color: '#595959', editable: true,  required: false },
                            { label: 'REFERENCE ARTICLE',     field: 'referenceArticleNumber',      bold: false, color: '#1a1a1a', editable: true,  required: false },
                            { label: 'REFERENCE ARTICLE DESC',field: 'referenceArticleDescription', bold: false, color: '#1a1a1a', editable: true,  required: false },
                        ] as { label: string; field: string; bold: boolean; color: string; editable: boolean; required: boolean }[]).map(({ label, field, bold, color, editable, required }, i) => {
                            const value = field === 'articleNumber'
                                ? (item.sapArticleId || (item as any)[field])
                                : field === 'majorCategory'
                                ? effectiveMajCat || (item as any)[field]
                                : (item as any)[field];
                            const displayVal = localValues[field] !== undefined ? localValues[field] : value;
                            const isEditingThis = editingField === `hdr_${field}`;
                            const canEdit = editable && !isLocked;
                            const isEmpty = !displayVal;
                            const showRequiredError = required && isEmpty && !isLocked;
                            return (
                                <div key={i} style={{
                                    flex: i >= 4 ? 2 : 1,
                                    padding: '5px 10px',
                                    borderRight: i < 6 ? '1px solid #f0f0f0' : 'none',
                                    minWidth: 0,
                                    cursor: canEdit ? 'pointer' : 'default',
                                    background: isEditingThis ? '#e6f7ff' : 'transparent',
                                }}
                                onClick={() => { if (canEdit && !isEditingThis) setEditingField(`hdr_${field}`); }}
                                >
                                    <div style={{ fontSize: 9, color: showRequiredError ? '#ff4d4f' : '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2, fontWeight: 600 }}>
                                        {label}{required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
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
                                    ) : isEditingThis && field === 'vendorName' ? (
                                        <AutoComplete
                                            autoFocus
                                            defaultOpen
                                            size="small"
                                            defaultValue={displayVal || ''}
                                            options={vendorOptions}
                                            style={{ width: '100%', fontSize: 12 }}
                                            notFoundContent={vendorSearching ? <Spin size="small" /> : null}
                                            onChange={(val) => searchVendors(val)}
                                            onSelect={(_val: string, option: any) => {
                                                // option.vendorName is the clean name (no code suffix)
                                                const cleanName = option.vendorName || _val.split('||')[0];
                                                // Save vendor name + auto-fill vendor code together
                                                const updates: Record<string, string | null> = { vendorName: cleanName };
                                                if (option.vendorCode) updates.vendorCode = option.vendorCode;
                                                setLocalValues(prev => ({ ...prev, ...updates }));
                                                onSave(
                                                    { ...item, ...updates } as ApproverItem,
                                                    updates as Record<string, unknown>
                                                );
                                                setEditingField(null);
                                                setVendorOptions([]);
                                            }}
                                            onBlur={(e) => {
                                                const val = (e.target as HTMLInputElement).value;
                                                if (val) handleSave('vendorName', val);
                                                else setEditingField(null);
                                                setVendorOptions([]);
                                            }}
                                        />
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
                                        <div style={{ fontSize: 12, fontWeight: 400, color: displayVal ? color : showRequiredError ? '#fa8c16' : '#bfbfbf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: showRequiredError ? 'italic' : 'normal' }}>
                                            {displayVal || (showRequiredError ? 'Required' : canEdit ? 'Click to fill' : '—')}
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
                    const activeGroups = cardGroups.filter(g => groupMap[g.group]);

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
                                            {groupMap[g.group].attrs.map(({ field, label, schemaKey, values, freeText, isMandatory }) => {
                                                const currentValue = getValue(field);
                                                const isEffectivelyEmpty = !currentValue || currentValue.trim() === '';
                                                const isEmpty = isEffectivelyEmpty;
                                                const isEditing = editingField === field;
                                                const isEmptyMandatory = isMandatory && isEffectivelyEmpty && !isLocked;
                                                return (
                                                    <tr key={field} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                                        {/* Attribute label */}
                                                        <td style={{
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            fontWeight: isMandatory ? 700 : 400,
                                                            color: isEmptyMandatory ? '#cf1322' : '#595959',
                                                            background: '#fafafa',
                                                            borderRight: '1px solid #f0f0f0',
                                                            whiteSpace: 'nowrap',
                                                            verticalAlign: 'middle',
                                                            maxWidth: 120,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}>
                                                            {label}{isMandatory && <span style={{ color: '#ff4d4f', marginLeft: 1 }}>*</span>}
                                                        </td>
                                                        <td
                                                            colSpan={1}
                                                            style={{
                                                                padding: '3px 8px',
                                                                cursor: isLocked ? 'default' : 'pointer',
                                                                background: isEditing ? '#e6f7ff' : 'transparent',
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
                                                                    defaultValue={isEffectivelyEmpty ? undefined : currentValue}
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
                                                                        color: isEffectivelyEmpty ? (isEmptyMandatory ? '#ff4d4f' : '#bfbfbf') : '#1a1a1a',
                                                                        fontStyle: isEffectivelyEmpty && !isEmptyMandatory ? 'italic' : 'normal',
                                                                        fontWeight: isEmptyMandatory ? 600 : 'normal',
                                                                        flex: 1,
                                                                    }}>
                                                                        {isEffectivelyEmpty
                                                                            ? (isEmptyMandatory ? 'Required' : '—')
                                                                            : currentValue}
                                                                    </span>
                                                                    {/* Show clear X only when there is a real value (not "-") */}
                                                                    {!isEffectivelyEmpty && !isLocked && (
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
                                    {(g.group === 'FAB' || g.group === 'FABRIC') && (() => {
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
                                            { label: 'RATE / COST',  field: 'rate',       editable: true,  mandatory: true  },
                                            { label: 'MRP',          field: 'mrp',        editable: true,  mandatory: true  },
                                            { label: 'MARKDOWN',     field: '_markdown',  editable: false, mandatory: false },
                                        ].map(({ label, field, editable, mandatory }) => {
                                            const isEditingBom = editingField === `bom_${field}`;
                                            const val = field === '_markdown' ? markdown
                                                : String(getValue(field) ?? '').trim() || '—';
                                            const isEmpty = val === '—';
                                            const isDropdown = field === 'macroMvgr';
                                            const dropdownOptions: string[] = isDropdown
                                                ? (getCachedValues(item.division ?? '', field) ?? [])
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
                {!item.articleNumber && (() => {
                    const effectiveVendorCode = localValues['vendorCode'] !== undefined ? localValues['vendorCode'] : item.vendorCode;
                    const vendorCodeMissing = !effectiveVendorCode;
                    return (
                        <div style={{ padding: '8px 12px', borderTop: '1px solid #e8e8e8', background: '#fafafa' }}>
                            <Tooltip title={vendorCodeMissing ? 'Vendor Code is required before proceeding' : undefined}>
                                <Button
                                    icon={<RocketOutlined />}
                                    disabled={vendorCodeMissing}
                                    onClick={() => onProceedFGArticle(item)}
                                    style={{ background: vendorCodeMissing ? '#f5f5f5' : '#fff0ee', color: vendorCodeMissing ? '#bfbfbf' : '#c94f44', border: `1px solid ${vendorCodeMissing ? '#d9d9d9' : '#f5c2bc'}`, fontWeight: 600, fontSize: 13, width: '100%', height: 36 }}
                                >
                                    Proceed for FG Article Creation
                                </Button>
                            </Tooltip>
                        </div>
                    );
                })()}

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
                                pathType={pathType}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Image preview modal */}
        <Modal
            open={imgModalOpen}
            onCancel={() => setImgModalOpen(false)}
            footer={null}
            centered
            width="auto"
            styles={{ body: { padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' } }}
            title={item.imageName || 'Image Preview'}
        >
            <img
                src={imgUrl || ''}
                alt={item.imageName || 'preview'}
                style={{ maxWidth: '80vw', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
            />
        </Modal>

        {/* Duplicate confirmation modal */}
        <Modal
            open={dupConfirmOpen}
            onCancel={() => { if (!duplicating) setDupConfirmOpen(false); }}
            title="Confirm Duplicate"
            centered
            destroyOnHidden
            footer={[
                <Button
                    key="cancel"
                    onClick={() => setDupConfirmOpen(false)}
                    disabled={duplicating}
                >
                    Cancel
                </Button>,
                <Button
                    key="continue"
                    type="primary"
                    loading={duplicating}
                    onClick={async () => {
                        setDuplicating(true);
                        try {
                            await onDuplicate(item);
                        } catch (err) {
                            message.error(err instanceof Error ? err.message : 'Failed to duplicate article');
                        } finally {
                            setDuplicating(false);
                            setDupConfirmOpen(false);
                        }
                    }}
                >
                    Continue
                </Button>,
            ]}
        >
            <p style={{ margin: 0 }}>
                A new copy of this article will be created with all the same values. Do you want to continue?
            </p>
        </Modal>
        </>
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
    onDuplicate,
    attributes,
    onRefresh,
    pathType,
    serverPagination,
}) => {
    // Load attribute groups from DB once; fall back to hardcoded ATTRIBUTE_GROUPS.
    const [cardGroups, setCardGroups] = useState<CardGroup[]>(() => {
        const cached = getCachedAttributeGroups();
        return cached && cached.length > 0 ? buildCardGroups(cached) : ATTRIBUTE_GROUPS;
    });

    useEffect(() => {
        preloadAttributeGroups().then(entries => {
            if (entries.length > 0) setCardGroups(buildCardGroups(entries));
        }).catch(() => {/* keep hardcoded fallback */});
    }, []);

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

    const handleDuplicate = useCallback(async (item: ApproverItem): Promise<void> => {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${item.id}/duplicate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || 'Failed to duplicate article');
        }
        message.success('Article duplicated successfully');
        onRefresh();
    }, [onRefresh]);

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
                    onDuplicate={handleDuplicate}
                    attributes={attributes}
                    onRefresh={onRefresh}
                    cardGroups={cardGroups}
                    pathType={pathType}
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
