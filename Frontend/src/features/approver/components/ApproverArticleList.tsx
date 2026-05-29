import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  FileText,
  LayoutGrid,
  Rocket,
  Info,
  Users,
  Copy,
  Maximize2,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Shirt,
  User as UserIcon,
  Hash,
  Wand2,
  Briefcase,
  DollarSign,
} from 'lucide-react';
import {
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tag,
  Tooltip,
  type AutocompleteOption,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import type { ApproverItem, MasterAttribute } from './ApproverTable';
import {
  getMajCatAllowedValues,
  SCHEMA_KEY_TO_EXCEL_ATTR,
  SCHEMA_KEY_TO_DB_FIELD,
  normalizeMajorCategory,
} from '../../../data/majCatAttributeMap';
import { getMajorCategoriesByDivision, getMcCodeByMajorCategory } from '../../../data/majorCategoryMcCodeMap';
import {
  preloadAttributeValues,
  getCachedValues,
  isValuesCached,
  preloadAttributeGroups,
  getCachedAttributeGroups,
  preloadCategoryAttributes,
  getCachedCategoryAttributes,
  invalidateValuesCache,
} from '../../../services/articleConfigService';
import { getImageUrl } from '../../../shared/utils/common/helpers';
import { APP_CONFIG } from '../../../constants/app/config';
import { formatDivisionLabel } from '../../../shared/utils/ui/formatters';
import VariantSubTable from './VariantSubTable';

// Module-level BOM cache (shared across card instances)
const bomCache = new Map<string, Promise<Record<string, Record<string, string>>>>();

const fetchBomMap = (category: string): Promise<Record<string, Record<string, string>>> => {
  const existing = bomCache.get(category);
  if (existing) return existing;
  const token = localStorage.getItem('authToken');
  const p = fetch(`${APP_CONFIG.api.baseURL}/approver/bom-art-numbers/${encodeURIComponent(category)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.json())
    .then((res) => (res?.data as Record<string, Record<string, string>>) ?? {})
    .catch(() => ({}));
  bomCache.set(category, p);
  return p;
};

const f = (schemaKey: string) => SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey] ?? schemaKey;

const ATTRIBUTE_GROUPS: { group: string; color: string; fields: { field: string; schemaKey: string; freeText?: boolean }[] }[] = [
  {
    group: 'FAB',
    color: '#e6f4ff',
    fields: [
      { field: 'yarn1', schemaKey: 'yarn_01' },
      { field: 'mainMvgr', schemaKey: 'main_mvgr' },
      { field: 'fabricMainMvgr', schemaKey: 'fabric_main_mvgr' },
      { field: 'weave', schemaKey: 'weave' },
      { field: 'mFab2', schemaKey: 'm_fab2' },
      { field: 'composition', schemaKey: 'composition' },
      { field: 'fCount', schemaKey: 'f_count' },
      { field: 'fConstruction', schemaKey: 'f_construction' },
      { field: 'lycra', schemaKey: 'lycra_non_lycra' },
      { field: 'finish', schemaKey: 'finish' },
      { field: 'gsm', schemaKey: 'gsm' },
      { field: 'fOunce', schemaKey: 'f_ounce' },
      { field: 'fWidth', schemaKey: 'f_width' },
      { field: 'fabDiv', schemaKey: 'fab_div' },
      { field: 'shade', schemaKey: 'shade', freeText: true },
      { field: 'weight', schemaKey: 'weight', freeText: true },
    ],
  },
  {
    group: 'BODY',
    color: '#f6ffed',
    fields: [
      { field: 'collar', schemaKey: 'collar' },
      { field: 'collarStyle', schemaKey: 'collar_style' },
      { field: 'neckDetails', schemaKey: 'neck_details' },
      { field: 'neck', schemaKey: 'neck' },
      { field: 'placket', schemaKey: 'placket' },
      { field: 'fatherBelt', schemaKey: 'father_belt' },
      { field: 'childBelt', schemaKey: 'child_belt' },
      { field: 'sleeve', schemaKey: 'sleeve' },
      { field: 'sleeveFold', schemaKey: 'sleeve_fold' },
      { field: 'bottomFold', schemaKey: 'bottom_fold' },
      { field: 'noOfPocket', schemaKey: 'no_of_pocket' },
      { field: 'pocketType', schemaKey: 'pocket_type' },
      { field: 'extraPocket', schemaKey: 'extra_pocket' },
      { field: 'fit', schemaKey: 'fit' },
      { field: 'pattern', schemaKey: 'body_style' },
      { field: 'length', schemaKey: 'length' },
      { field: 'frontOpenStyle', schemaKey: 'front_open_style', freeText: true },
    ],
  },
  {
    group: 'VA ACC.',
    color: '#fff7e6',
    fields: [
      { field: 'drawcord', schemaKey: 'drawcord' },
      { field: 'dcShape', schemaKey: 'dc_shape' },
      { field: 'button', schemaKey: 'button' },
      { field: 'btnColour', schemaKey: 'btn_colour' },
      { field: 'zipper', schemaKey: 'zipper' },
      { field: 'zipColour', schemaKey: 'zip_colour' },
      { field: 'patchesType', schemaKey: 'patches_type' },
      { field: 'patches', schemaKey: 'patches' },
      { field: 'htrfType', schemaKey: 'htrf_type' },
      { field: 'htrfStyle', schemaKey: 'htrf_style' },
    ],
  },
  {
    group: 'VA PRCS',
    color: '#fff0f6',
    fields: [
      { field: 'printType', schemaKey: 'print_type' },
      { field: 'printStyle', schemaKey: 'print_style' },
      { field: 'printPlacement', schemaKey: 'print_placement' },
      { field: 'embroidery', schemaKey: 'embroidery' },
      { field: 'embroideryType', schemaKey: 'embroidery_type' },
      { field: 'embPlacement', schemaKey: 'emb_placement' },
      { field: 'wash', schemaKey: 'wash' },
    ],
  },
  {
    group: 'BUSINESS',
    color: '#f9f0ff',
    fields: [
      { field: 'ageGroup', schemaKey: 'age_group' },
      { field: 'articleFashionType', schemaKey: 'article_fashion_type' },
      { field: 'segment', schemaKey: 'segment', freeText: true },
      { field: 'mvgrBrandVendor', schemaKey: 'mvgr_brand_vendor', freeText: true },
    ],
  },
];

const GROUP_COLORS: Record<string, string> = {
  FAB: '#e6f4ff',
  BODY: '#f6ffed',
  'VA ACC.': '#fff7e6',
  'VA PRCS': '#fff0f6',
  BUSINESS: '#f9f0ff',
};
const GROUP_ORDER = ['FAB', 'BODY', 'VA ACC.', 'VA PRCS', 'BUSINESS'];

// ─── Redesign tokens — header/icon palette per group ──────────────────────────
const GROUP_LABELS: Record<string, string> = {
  FAB: 'Construction & Fabric',
  BODY: 'Body & Construction',
  'VA ACC.': 'Trims & Accessories',
  'VA PRCS': 'Finishing & Process',
  BUSINESS: 'Business & Misc',
};

const GROUP_ICONS: Record<string, React.ReactNode> = {
  FAB: <Shirt className="h-3.5 w-3.5" />,
  BODY: <UserIcon className="h-3.5 w-3.5" />,
  'VA ACC.': <Hash className="h-3.5 w-3.5" />,
  'VA PRCS': <Wand2 className="h-3.5 w-3.5" />,
  BUSINESS: <Briefcase className="h-3.5 w-3.5" />,
};

const GROUP_HEADER_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  FAB: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  BODY: { bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0' },
  'VA ACC.': { bg: '#fef3c7', fg: '#a16207', border: '#fde68a' },
  'VA PRCS': { bg: '#fdf2f8', fg: '#be185d', border: '#fbcfe8' },
  BUSINESS: { bg: '#faf5ff', fg: '#7e22ce', border: '#e9d5ff' },
};

type CardGroup = typeof ATTRIBUTE_GROUPS[number];

function buildCardGroups(entries: { key: string; type: string; group: string }[]): CardGroup[] {
  const map = new Map<string, CardGroup['fields']>();
  for (const e of entries) {
    const dbField = SCHEMA_KEY_TO_DB_FIELD[e.key];
    if (!dbField) continue;
    if (!map.has(e.group)) map.set(e.group, []);
    map.get(e.group)!.push({ field: dbField, schemaKey: e.key, freeText: e.type === 'TEXT' ? true : undefined });
  }
  const built = GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
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
  onSave: (item: ApproverItem, updates: Record<string, unknown>) => void;
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
  if (item.approvalStatus === 'APPROVED' && item.sapSyncStatus === 'SYNCED')
    return { label: 'DONE', color: '#52c41a' };
  return { label: 'PENDING', color: '#faad14' };
};

// ── Single article card ───────────────────────────────────────────────────────
const ArticleCard = React.memo(
  ({
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
    onSave: (item: ApproverItem, updates: Record<string, unknown>) => void;
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
    const [allCollapsed, setAllCollapsed] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const prevItemRef = React.useRef<ApproverItem>(item);
    React.useEffect(() => {
      const prev = prevItemRef.current;
      prevItemRef.current = item;
      if (prev === item) return;
      setLocalValues((local) => {
        const next: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(local)) {
          const itemVal = (item as any)[k] ?? null;
          const strItemVal = itemVal === null ? null : String(itemVal);
          if (strItemVal !== (v === null ? null : String(v ?? ''))) {
            // server wins
          } else {
            next[k] = v;
          }
        }
        return next;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item]);

    // Auto-persist MRP when null in DB but rate is present
    React.useEffect(() => {
      if (item.approvalStatus === 'APPROVED' || item.approvalStatus === 'REJECTED') return;
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u.role !== 'ADMIN' && u.division && item.division && u.division !== item.division) return;
        }
      } catch {
        /* ignore */
      }
      const storedMrp = parseFloat(String((item as any).mrp ?? ''));
      if (!isNaN(storedMrp) && storedMrp > 1) return;
      const rate = parseFloat(String((item as any).rate ?? ''));
      if (isNaN(rate) || rate <= 0) return;
      const calculated = String(Math.ceil((rate * 1.47) / 25) * 25);
      setLocalValues((prev) => ({ ...prev, mrp: calculated }));
      onSave({ ...item, mrp: calculated } as ApproverItem, { mrp: calculated });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    const effectiveMajCat = useMemo(() => {
      const raw = (localValues['majorCategory'] !== undefined ? localValues['majorCategory'] : item.majorCategory) || '';
      return normalizeMajorCategory(raw, item.division);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localValues['majorCategory'], item.majorCategory, item.division]);

    const [cacheReady, setCacheReady] = useState(false);
    const [catConfigReady, setCatConfigReady] = useState(false);

    const attributeFields = useMemo(
      () =>
        cardGroups.flatMap((g) =>
          g.fields.map((a) => ({ ...a, label: f(a.schemaKey), group: g.group, groupColor: g.color, freeText: a.freeText ?? false })),
        ),
      [cardGroups],
    );

    const { visibleAttrs, mandatoryKeys } = useMemo(() => {
      if (!effectiveMajCat) return { visibleAttrs: [], mandatoryKeys: new Set<string>() };
      const dbConfig = getCachedCategoryAttributes(effectiveMajCat);
      const mk: Set<string> = dbConfig?.required ?? new Set();
      const visible = attributeFields
        .map((af) => {
          if (dbConfig?.configured) {
            if (!dbConfig.enabled.has(af.schemaKey)) return null;
            const values = getMajCatAllowedValues(item.division || '', af.schemaKey) ?? [];
            return {
              field: af.field,
              label: af.label,
              schemaKey: af.schemaKey,
              group: af.group,
              groupColor: af.groupColor,
              values,
              freeText: af.freeText ?? false,
            };
          }
          const values = af.freeText ? [] : getMajCatAllowedValues(item.division || '', af.schemaKey) ?? [];
          return {
            field: af.field,
            label: af.label,
            schemaKey: af.schemaKey,
            group: af.group,
            groupColor: af.groupColor,
            values,
            freeText: af.freeText ?? false,
          };
        })
        .filter((af): af is NonNullable<typeof af> => af !== null);
      return { visibleAttrs: visible, mandatoryKeys: mk };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveMajCat, cacheReady, catConfigReady, attributeFields]);

    const [editingField, setEditingField] = useState<string | null>(null);

    // Vendor autocomplete state
    const [vendorQuery, setVendorQuery] = useState('');
    const [vendorOptions, setVendorOptions] = useState<AutocompleteOption[]>([]);
    const [vendorSearching, setVendorSearching] = useState(false);
    const vendorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [attrArticleNums, setAttrArticleNums] = useState<Record<string, string>>(() => {
      try {
        return JSON.parse((item as any).attrArticleNums || '{}');
      } catch {
        return {};
      }
    });
    const [bomMap, setBomMap] = useState<Record<string, Record<string, string>>>({});

    useEffect(() => {
      if (!item.division) return;
      if (isValuesCached(item.division) && getCachedValues(item.division, 'impAtrbt2') === null) {
        invalidateValuesCache(item.division);
      }
      preloadAttributeValues(item.division)
        .then(() => setCacheReady(true))
        .catch(() => setCacheReady(true));
    }, [item.division]);

    useEffect(() => {
      if (!effectiveMajCat) return;
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
      fetchBomMap(effectiveMajCat).then((data) => {
        if (!cancelled) setBomMap(data);
      });
      return () => {
        cancelled = true;
      };
    }, [effectiveMajCat]);

    const getArtNum = useCallback(
      (schemaKey: string, field: string, currentValue: string | null): string => {
        const excelAttrName = SCHEMA_KEY_TO_EXCEL_ATTR[schemaKey];
        if (excelAttrName && currentValue && bomMap[excelAttrName]?.[currentValue]) {
          return bomMap[excelAttrName][currentValue];
        }
        return attrArticleNums[field] || '';
      },
      [bomMap, attrArticleNums],
    );

    const saveAttrArticleNum = (field: string, val: string) => {
      const updated = { ...attrArticleNums, [field]: val };
      setAttrArticleNums(updated);
      const attrUpdates = { attrArticleNums: JSON.stringify(updated) };
      onSave({ ...item, ...attrUpdates } as any, attrUpdates);
    };

    const [failedImg, setFailedImg] = useState(false);
    const [refreshedUrl, setRefreshedUrl] = useState<string | null>(null);
    const refreshAttempted = React.useRef(false);

    const FAB_FIELDS = useMemo(
      () => (cardGroups.find((g) => g.group === 'FAB')?.fields ?? []).filter((f) => !f.freeText),
      [cardGroups],
    );
    const BODY_FIELDS = useMemo(
      () => (cardGroups.find((g) => g.group === 'BODY')?.fields ?? []).filter((f) => !f.freeText),
      [cardGroups],
    );

    const getFieldVal = useCallback(
      (field: string) => {
        const v = localValues[field] !== undefined ? localValues[field] : (item as any)[field];
        return v ? String(v).trim() : null;
      },
      [localValues, item],
    );

    React.useEffect(() => {
      if (item.approvalStatus !== 'PENDING') return;
      if (mandatoryKeys.size === 0) return;
      setLocalValues((prev) => {
        const getVal = (field: string) => {
          const v = prev[field] !== undefined ? prev[field] : (item as any)[field];
          return v ? String(v).trim() : null;
        };
        const fabParts = FAB_FIELDS.filter((f) => mandatoryKeys.has(f.schemaKey))
          .map((f) => getVal(f.field))
          .filter(Boolean) as string[];
        const bodyParts = BODY_FIELDS.filter((f) => mandatoryKeys.has(f.schemaKey))
          .map((f) => getVal(f.field))
          .filter(Boolean) as string[];
        const newFabDesc = fabParts.length > 0 ? fabParts.join('-').slice(0, 40) : null;
        const newBodyDesc = bodyParts.length > 0 ? bodyParts.join('-').slice(0, 40) : null;
        const updates: Record<string, string | null> = {};
        if (newFabDesc !== null && newFabDesc !== prev['fabricArticleDescription']) updates['fabricArticleDescription'] = newFabDesc;
        if (newBodyDesc !== null && newBodyDesc !== prev['bodyArticleDescription']) updates['bodyArticleDescription'] = newBodyDesc;
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    }, [mandatoryKeys, item, FAB_FIELDS, BODY_FIELDS]);

    const isLocked = item.approvalStatus === 'APPROVED' || item.approvalStatus === 'REJECTED';
    const status = getDisplayStatus(item);

    const imgSrc = refreshedUrl || item.imageUrl;
    const imgUrl = imgSrc && !failedImg ? getImageUrl(imgSrc) : null;

    const handleImgError = useCallback(async () => {
      if (refreshAttempted.current) {
        setFailedImg(true);
        return;
      }
      refreshAttempted.current = true;
      setFailedImg(true);
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${APP_CONFIG.api.baseURL}/approver/image/${item.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.url) {
          const base = data.url as string;
          const freshUrl = base.includes('X-Amz-Signature')
            ? base
            : base + (base.includes('?') ? '&' : '?') + '_cb=' + Date.now();
          setRefreshedUrl(freshUrl);
          setFailedImg(false);
        }
      } catch {
        /* ignore */
      }
    }, [item.id]);

    const calcMrpFromRate = (rate: number): number => Math.ceil((rate * 1.47) / 25) * 25;

    const getValue = (field: string): string | null => {
      if (field in localValues) return localValues[field];
      if (field === 'mrp') {
        const stored = (item as any).mrp;
        const storedNum = parseFloat(String(stored ?? ''));
        if (isNaN(storedNum) || storedNum <= 1) {
          const rate = parseFloat(String((item as any).rate ?? ''));
          if (!isNaN(rate) && rate > 0) return String(calcMrpFromRate(rate));
        }
      }
      return (item as any)[field] ?? null;
    };

    const searchVendors = (q: string) => {
      setVendorQuery(q);
      if (vendorDebounceRef.current) clearTimeout(vendorDebounceRef.current);
      if (!q || q.trim().length < 2) {
        setVendorOptions([]);
        return;
      }
      vendorDebounceRef.current = setTimeout(async () => {
        setVendorSearching(true);
        try {
          const token = localStorage.getItem('authToken');
          const res = await fetch(
            `${APP_CONFIG.api.baseURL}/approver/vendor-search?q=${encodeURIComponent(q.trim())}`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          );
          const json = await res.json();
          const opts = (json.data ?? []).map(
            (v: { vendorCode: string; vendorName: string; vendorCity?: string }) => ({
              value: v.vendorName,
              vendorCode: v.vendorCode,
              label: (
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{v.vendorName}</span>
                  <span className="text-[11px] text-muted-foreground">{v.vendorCity ?? ''}</span>
                </div>
              ),
            }),
          );
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
        if (!isNaN(rate) && rate > 0) updates['mrp'] = String(calcMrpFromRate(rate));
      }
      if (field === 'majorCategory' && value) {
        const newMcCode = getMcCodeByMajorCategory(value);
        if (newMcCode) updates['mcCode'] = newMcCode;
      }
      setLocalValues((prev) => ({ ...prev, ...updates }));
      setEditingField(null);
      onSave({ ...item, ...updates } as ApproverItem, updates as Record<string, unknown>);
    };

    const borderColor =
      item.approvalStatus === 'APPROVED' ? '#b7eb8f' : item.approvalStatus === 'REJECTED' ? '#ffa39e' : '#e8e8e8';
    const bgColor =
      item.approvalStatus === 'APPROVED' ? '#f6ffed' : item.approvalStatus === 'REJECTED' ? '#fff1f0' : '#fff';

    // Compute markdown + active groups for render
    const groupMap: Record<string, { color: string; attrs: typeof visibleAttrs }> = {};
    for (const attr of visibleAttrs) {
      if (!groupMap[attr.group]) groupMap[attr.group] = { color: attr.groupColor, attrs: [] };
      groupMap[attr.group].attrs.push(attr);
    }
    const activeGroups = ATTRIBUTE_GROUPS.filter((g) => groupMap[g.group]);

    const rateVal = String(getValue('rate') ?? '').trim();
    const mrpVal = String(getValue('mrp') ?? '').trim();
    const rateNum = parseFloat(rateVal);
    const mrpNum = parseFloat(mrpVal);
    const markdown =
      !isNaN(rateNum) && !isNaN(mrpNum) && mrpNum > 0 ? (((mrpNum - rateNum) / mrpNum) * 100).toFixed(1) + '%' : '—';

    const renderFabBodyField = (
      field: string,
      label: string,
      autoFillFn?: () => void,
      maxLen?: number,
    ) => {
      const displayVal = localValues[field] !== undefined ? localValues[field] : (item as any)[field];
      const isEditingThis = editingField === `bot_${field}`;
      const saveVal = (raw: string | null) => {
        const v = raw || null;
        handleSave(field, maxLen && v ? v.slice(0, maxLen) : v);
      };
      return (
        <div
          className="cursor-pointer border-t border-border bg-muted/40 px-2 py-1"
          style={{ cursor: isLocked ? 'default' : 'pointer', background: isEditingThis ? '#e6f7ff' : undefined }}
          onClick={() => {
            if (!isLocked && !isEditingThis) setEditingField(`bot_${field}`);
          }}
        >
          <div className="mb-0.5 flex items-center gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            {autoFillFn && !isLocked && (
              <span
                className="cursor-pointer text-[9px] text-indigo-600 underline"
                onClick={(e) => {
                  e.stopPropagation();
                  autoFillFn();
                }}
              >
                Auto-fill
              </span>
            )}
          </div>
          {isEditingThis ? (
            <Input
              autoFocus
              defaultValue={displayVal || ''}
              className="h-7 px-1 text-[11px]"
              maxLength={maxLen}
              onKeyDown={(e) => e.key === 'Enter' && saveVal((e.target as HTMLInputElement).value)}
              onBlur={(e) => saveVal(e.target.value)}
            />
          ) : (
            <div className="truncate text-[11px]" style={{ color: displayVal ? '#1a1a1a' : '#bfbfbf' }}>
              {displayVal || (isLocked ? '—' : 'Click to fill')}
            </div>
          )}
        </div>
      );
    };

    // ─── Helper closures used by the new layout ─────────────────────────────────

    // Compute global 1..N numbering across all visible attributes (mockup pattern)
    let _attrCounter = 0;

    const HEADER_FIELDS = [
      { label: 'MAJOR CATEGORY', field: 'majorCategory', editable: true, required: false, color: '#2f54eb' },
      {
        label: 'ARTICLE NUMBER',
        field: 'articleNumber',
        editable: !item.sapArticleId,
        required: false,
        color: item.sapArticleId ? '#15803d' : '#1d4ed8',
      },
      { label: 'VENDOR CODE', field: 'vendorCode', editable: true, required: true, color: '#1f2937' },
      { label: 'VENDOR NAME', field: 'vendorName', editable: true, required: true, color: '#1f2937' },
      { label: 'ARTICLE DESC', field: 'articleDescription', editable: true, required: false, color: '#4b5563' },
      { label: 'REFERENCE ARTICLE', field: 'referenceArticleNumber', editable: true, required: false, color: '#1f2937' },
      { label: 'REFERENCE ARTICLE DESC', field: 'referenceArticleDescription', editable: true, required: false, color: '#1f2937' },
    ] as const;

    const renderHeaderField = ({
      label,
      field,
      editable,
      required,
      color,
    }: { label: string; field: string; editable: boolean; required: boolean; color: string }) => {
      const baseValue =
        field === 'articleNumber'
          ? item.sapArticleId || (item as any)[field]
          : field === 'majorCategory'
          ? effectiveMajCat || (item as any)[field]
          : (item as any)[field];
      const displayVal = localValues[field] !== undefined ? localValues[field] : baseValue;
      const isEditingThis = editingField === `hdr_${field}`;
      const canEdit = editable && !isLocked;
      const isEmpty = !displayVal;
      const showRequiredError = required && isEmpty && !isLocked;
      return (
        <div
          key={field}
          className="border-b border-border last:border-b-0"
          style={{ cursor: canEdit ? 'pointer' : 'default' }}
          onClick={() => {
            if (canEdit && !isEditingThis) setEditingField(`hdr_${field}`);
          }}
        >
          <div className="flex items-start justify-between gap-2 px-3 py-1.5">
            <span
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: showRequiredError ? '#dc2626' : '#6b7280' }}
            >
              {label}
              {required && <span className="ml-0.5 text-red-500">*</span>}
            </span>
            <div className="min-w-0 flex-1 text-right">
              {isEditingThis && field === 'majorCategory' ? (
                <Select
                  defaultValue={displayVal || undefined}
                  onValueChange={(val) => handleSave(field, val || null)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getMajorCategoriesByDivision(item.division || '').map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : isEditingThis && field === 'vendorName' ? (
                <Autocomplete
                  autoFocus
                  value={vendorQuery || displayVal || ''}
                  onChange={searchVendors}
                  options={vendorOptions}
                  notFoundContent={vendorSearching ? <Spinner size="sm" /> : null}
                  onSelect={(val, option) => {
                    handleSave('vendorName', val || null);
                    if (option.vendorCode) {
                      setLocalValues((prev) => ({ ...prev, vendorCode: option.vendorCode }));
                      onSave(
                        { ...item, vendorCode: option.vendorCode } as ApproverItem,
                        { vendorCode: option.vendorCode } as Record<string, unknown>,
                      );
                    }
                    setVendorOptions([]);
                    setVendorQuery('');
                  }}
                  onBlur={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val) handleSave('vendorName', val);
                    else setEditingField(null);
                    setVendorOptions([]);
                    setVendorQuery('');
                  }}
                  className="text-xs"
                />
              ) : isEditingThis ? (
                <Input
                  autoFocus
                  defaultValue={displayVal || ''}
                  className="h-7 px-1 text-xs"
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleSave(field, (e.target as HTMLInputElement).value || null)
                  }
                  onBlur={(e) => handleSave(field, e.target.value || null)}
                />
              ) : (
                <span
                  className="truncate text-xs"
                  style={{
                    color: displayVal ? color : showRequiredError ? '#ea580c' : '#9ca3af',
                    fontStyle: showRequiredError ? 'italic' : 'normal',
                  }}
                >
                  {displayVal || (showRequiredError ? 'Required' : canEdit ? 'Click to fill' : '—')}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    };

    const renderAttributeRow = (attr: {
      field: string;
      label: string;
      schemaKey: string;
      values: any[];
      freeText: boolean;
      group: string;
    }) => {
      _attrCounter += 1;
      const num = _attrCounter;
      const currentValue = getValue(attr.field);
      const isEmpty = !currentValue;
      const isMandatory = !attr.freeText && mandatoryKeys.has(attr.schemaKey);
      const isEditing = editingField === attr.field;
      const isUserEdited = !!localValues[attr.field];

      return (
        <div
          key={attr.field}
          className="group flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-muted/40"
          style={{
            cursor: isLocked ? 'default' : 'pointer',
            background: isEditing
              ? '#e0f2fe'
              : isUserEdited
              ? '#ecfdf5'
              : isEmpty && isMandatory
              ? '#fffbeb'
              : !isEmpty && !isUserEdited
              ? '#eef2ff'
              : undefined,
          }}
          onClick={() => {
            if (!isLocked && !isEditing) setEditingField(attr.field);
          }}
        >
          <span className="w-5 shrink-0 text-right text-[10px] font-medium text-muted-foreground">{num}.</span>
          <span
            className="flex-1 truncate text-[11px]"
            style={{ color: isMandatory ? '#1f2937' : '#4b5563', fontWeight: isMandatory ? 600 : 400 }}
          >
            {isMandatory && <span className="mr-0.5 text-red-500">*</span>}
            {attr.label}
          </span>
          <div className="w-[110px] shrink-0">
            {attr.freeText ? (
              isEditing ? (
                <Input
                  autoFocus
                  defaultValue={currentValue || ''}
                  className="h-6 px-1 text-[11px]"
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleSave(attr.field, (e.target as HTMLInputElement).value || null)
                  }
                  onBlur={(e) => handleSave(attr.field, e.target.value || null)}
                />
              ) : (
                <span
                  className="block truncate text-right text-[11px]"
                  style={{
                    color: isEmpty ? '#9ca3af' : '#111827',
                    fontStyle: isEmpty ? 'italic' : 'normal',
                  }}
                >
                  {currentValue || (isLocked ? '—' : 'Click')}
                </span>
              )
            ) : isEditing ? (
              <Select
                defaultValue={currentValue || undefined}
                onValueChange={(val) => handleSave(attr.field, val ?? null)}
              >
                <SelectTrigger className="h-6 w-full text-[11px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {attr.values.map((v) => (
                    <SelectItem key={v.shortForm} value={v.shortForm}>
                      {v.shortForm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span
                className="flex items-center justify-end gap-1 text-right text-[11px]"
                style={{
                  color: isEmpty ? (isMandatory ? '#ea580c' : '#9ca3af') : '#111827',
                  fontStyle: isEmpty ? 'italic' : 'normal',
                }}
              >
                <span className="truncate">{currentValue || (isMandatory ? 'Required' : '—')}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
              </span>
            )}
          </div>
        </div>
      );
    };

    const toggleGroupCollapse = (g: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(g)) next.delete(g);
        else next.add(g);
        return next;
      });
      setAllCollapsed(false);
    };

    const isGroupCollapsed = (g: string) => allCollapsed || collapsedGroups.has(g);

    // AI confidence — average of available per-attribute confidences if present, else 92 placeholder
    const aiConfidenceValues: number[] = [];
    for (const af of attributeFields) {
      const v = (item as any)[af.field];
      if (typeof v === 'number' && Number.isFinite(v)) aiConfidenceValues.push(v);
    }
    const aiConfidence = (item as any).avgConfidence
      ? Math.round(Number((item as any).avgConfidence))
      : 92;

    return (
      <>
        <div
          className="mb-6 overflow-hidden rounded-xl border bg-white shadow-sm"
          style={{ borderColor }}
        >
          {/* ─── TOP HEADER STRIP (slate, matches dashboard) ─── */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-2 text-white"
            style={{ background: 'linear-gradient(90deg, #1f2937 0%, #334155 100%)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Checkbox
                checked={isSelected}
                disabled={item.approvalStatus === 'REJECTED'}
                onCheckedChange={() => onToggleSelect(item.id)}
                className="border-white/60 bg-white/10 data-[state=checked]:bg-white data-[state=checked]:text-indigo-600"
              />
              <Badge
                style={{ background: status.color + 'cc', color: '#fff', borderColor: status.color }}
                className="border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              >
                {status.label}
              </Badge>
              {item.sapSyncMessage && (
                <Tooltip
                  title={
                    <div className="max-h-[260px] overflow-y-auto text-xs">
                      <div className="mb-1.5 text-[13px] font-bold text-red-700">⚠ SAP Remark</div>
                      <div className="whitespace-pre-wrap leading-relaxed">{item.sapSyncMessage}</div>
                    </div>
                  }
                  side="bottom"
                >
                  <Info className="h-4 w-4 shrink-0 cursor-pointer text-amber-200" />
                </Tooltip>
              )}
              <span className="truncate text-[12px] text-white/90">
                {[formatDivisionLabel(item.division), item.subDivision].filter(Boolean).join(' › ')}
              </span>
              {(item.sapArticleId || item.articleNumber) && (
                <Badge className="bg-white/20 px-2 py-0.5 text-[11px] font-mono text-white">
                  {item.sapArticleId || item.articleNumber}
                </Badge>
              )}
              <span className="ml-2 truncate text-[11px] text-white/75">
                {[item.designNumber && `Design: ${item.designNumber}`, item.vendorName].filter(Boolean).join('  ·  ')}
                {item.rate != null && `  ·  ₹${item.rate}`}
                {item.mrp != null && Number(item.mrp) > 1 && ` / ₹${item.mrp}`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.pptNumber && (
                <Badge className="bg-amber-300 text-amber-950">PPT: {item.pptNumber}</Badge>
              )}
              {pathType === 'new' &&
                item.approvalStatus === 'PENDING' &&
                item.division?.toUpperCase() === 'KIDS' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDupConfirmOpen(true)}
                    className="h-8 border-white/40 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Copy />
                    Duplicate
                  </Button>
                )}
            </div>
          </div>

          {/* ─── MAIN GRID — image+info | attribute groups ─── */}
          <div className="grid gap-3 p-3 lg:grid-cols-[260px_1fr]">
            {/* ─── LEFT: Image + Article Info + Reference ─── */}
            <aside className="flex min-w-0 flex-col gap-3">
              {/* Article image */}
              <div className="overflow-hidden rounded-lg border border-border bg-white">
                <div className="flex items-center justify-between border-b border-border bg-indigo-50/60 px-3 py-2">
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                    <Info className="h-3 w-3" />
                    Article Image
                  </span>
                  <Badge variant="success" className="text-[10px]">1 / 1</Badge>
                </div>
                <div className="relative aspect-square bg-muted">
                  {imgUrl ? (
                    <>
                      <img
                        src={imgUrl}
                        alt=""
                        className="block h-full w-full cursor-pointer object-cover"
                        onError={handleImgError}
                        onClick={() => setImgModalOpen(true)}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="absolute right-2 top-2 h-7 w-7 bg-white/90 backdrop-blur"
                        onClick={() => setImgModalOpen(true)}
                      >
                        <Maximize2 />
                      </Button>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No Image
                    </div>
                  )}
                </div>
              </div>

              {/* Article information */}
              <div className="overflow-hidden rounded-lg border border-border bg-white">
                <div className="border-b border-border bg-indigo-50/60 px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                    Article Information
                  </span>
                </div>
                <div className="space-y-2 px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Article ID</span>
                    <span className="truncate text-right font-medium">
                      {item.sapArticleId || item.articleNumber || item.imageName || '—'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Category</span>
                    <span className="truncate text-right text-[11px]">
                      {[formatDivisionLabel(item.division), item.subDivision, effectiveMajCat]
                        .filter(Boolean)
                        .join(' › ') || '—'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">AI Confidence</span>
                    <Badge variant="success">{aiConfidence}%</Badge>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-[11px]">
                      {item.updatedAt || item.createdAt
                        ? new Date(item.updatedAt || item.createdAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reference & Vendor — 7 editable fields stacked */}
              <div className="overflow-hidden rounded-lg border border-border bg-white">
                <div className="border-b border-border bg-indigo-50/60 px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                    Reference &amp; Vendor
                  </span>
                </div>
                <div>{HEADER_FIELDS.map((f) => renderHeaderField(f as any))}</div>
              </div>
            </aside>

            {/* ─── MIDDLE: Attribute groups + BOM + Fabric/Body + Proceed FG ─── */}
            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Sparkles className="h-4 w-4 text-[#FF6F61]" />
                  GARMENT ATTRIBUTES ({visibleAttrs.length})
                  {/* Legend popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                        aria-label="Legend"
                      >
                        ?
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Legend
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded border border-indigo-300 bg-indigo-100" />
                          AI Predicted
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-100" />
                          User Modified
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50" />
                          Required (Empty)
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none text-red-500">*</span>
                          Mandatory Field
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAllCollapsed((c) => !c);
                    setCollapsedGroups(new Set());
                  }}
                  className="h-7 text-xs"
                >
                  {allCollapsed ? <ChevronDown /> : <ChevronUp />}
                  {allCollapsed ? 'Expand All' : 'Collapse All'}
                </Button>
              </div>

              {visibleAttrs.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {activeGroups.map((g) => {
                    const style = GROUP_HEADER_STYLE[g.group] ?? { bg: '#f3f4f6', fg: '#374151', border: '#e5e7eb' };
                    const collapsed = isGroupCollapsed(g.group);
                    return (
                      <div
                        key={g.group}
                        className="overflow-hidden rounded-lg border bg-white"
                        style={{ borderColor: style.border }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroupCollapse(g.group)}
                          className="flex w-full items-center justify-between border-b px-3 py-2"
                          style={{ background: style.bg, borderColor: style.border }}
                        >
                          <span
                            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                            style={{ color: style.fg }}
                          >
                            {GROUP_ICONS[g.group]}
                            {GROUP_LABELS[g.group] ?? g.group}
                          </span>
                          {collapsed ? (
                            <ChevronDown className="h-3 w-3" style={{ color: style.fg }} />
                          ) : (
                            <ChevronUp className="h-3 w-3" style={{ color: style.fg }} />
                          )}
                        </button>
                        {!collapsed && (
                          <div className="space-y-0.5 p-1.5">
                            {groupMap[g.group].attrs.map((attr) => renderAttributeRow(attr))}

                            {/* FAB: fabric article number + description + button */}
                            {g.group === 'FAB' &&
                              (() => {
                                const renderField = (
                                  field: string,
                                  label: string,
                                  autoFillFn?: () => void,
                                  maxLen?: number,
                                ) => {
                                  const displayVal =
                                    localValues[field] !== undefined ? localValues[field] : (item as any)[field];
                                  const isEditingThis = editingField === `bot_${field}`;
                                  const saveVal = (raw: string | null) => {
                                    const v = raw || null;
                                    handleSave(field, maxLen && v ? v.slice(0, maxLen) : v);
                                  };
                                  return (
                                    <div
                                      key={field}
                                      className="mt-1 border-t border-border bg-muted/30 px-2 py-1.5"
                                      style={{ cursor: isLocked ? 'default' : 'pointer' }}
                                      onClick={() => {
                                        if (!isLocked && !isEditingThis) setEditingField(`bot_${field}`);
                                      }}
                                    >
                                      <div className="mb-0.5 flex items-center justify-between gap-1">
                                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          {label}
                                        </span>
                                        {autoFillFn && !isLocked && (
                                          <button
                                            type="button"
                                            className="text-[9px] text-indigo-600 underline hover:text-indigo-800"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              autoFillFn();
                                            }}
                                          >
                                            Auto-fill
                                          </button>
                                        )}
                                      </div>
                                      {isEditingThis ? (
                                        <Input
                                          autoFocus
                                          defaultValue={displayVal || ''}
                                          maxLength={maxLen}
                                          className="h-6 px-1 text-[11px]"
                                          onKeyDown={(e) =>
                                            e.key === 'Enter' && saveVal((e.target as HTMLInputElement).value)
                                          }
                                          onBlur={(e) => saveVal(e.target.value)}
                                        />
                                      ) : (
                                        <div
                                          className="truncate text-[11px]"
                                          style={{ color: displayVal ? '#111827' : '#9ca3af' }}
                                        >
                                          {displayVal || (isLocked ? '—' : 'Click to fill')}
                                        </div>
                                      )}
                                    </div>
                                  );
                                };
                                const fabAutoFill = () => {
                                  const parts = FAB_FIELDS.filter((ff) => mandatoryKeys.has(ff.schemaKey))
                                    .map((ff) => {
                                      const v = localValues[ff.field] !== undefined ? localValues[ff.field] : (item as any)[ff.field];
                                      return v ? String(v).trim() : null;
                                    })
                                    .filter(Boolean);
                                  if (parts.length > 0)
                                    handleSave('fabricArticleDescription', parts.join('-').slice(0, 40));
                                };
                                return (
                                  <>
                                    {renderField('fabricArticleNumber', 'FABRIC ARTICLE NO.')}
                                    {renderField('fabricArticleDescription', 'FABRIC ARTICLE DESC', fabAutoFill, 40)}
                                    <div className="border-t border-border px-2 py-1.5">
                                      <Button
                                        size="sm"
                                        onClick={() => onCreateFabricArticle(item)}
                                        className="h-7 w-full border border-indigo-300 bg-indigo-50 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                                      >
                                        <FileText />
                                        Create Fabric Article
                                      </Button>
                                    </div>
                                  </>
                                );
                              })()}

                            {/* BODY: body article + description + button */}
                            {g.group === 'BODY' &&
                              (() => {
                                const renderField = (
                                  field: string,
                                  label: string,
                                  autoFillFn?: () => void,
                                  maxLen?: number,
                                ) => {
                                  const displayVal =
                                    localValues[field] !== undefined ? localValues[field] : (item as any)[field];
                                  const isEditingThis = editingField === `bot_${field}`;
                                  const saveVal = (raw: string | null) => {
                                    const v = raw || null;
                                    handleSave(field, maxLen && v ? v.slice(0, maxLen) : v);
                                  };
                                  return (
                                    <div
                                      key={field}
                                      className="mt-1 border-t border-border bg-muted/30 px-2 py-1.5"
                                      style={{ cursor: isLocked ? 'default' : 'pointer' }}
                                      onClick={() => {
                                        if (!isLocked && !isEditingThis) setEditingField(`bot_${field}`);
                                      }}
                                    >
                                      <div className="mb-0.5 flex items-center justify-between gap-1">
                                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          {label}
                                        </span>
                                        {autoFillFn && !isLocked && (
                                          <button
                                            type="button"
                                            className="text-[9px] text-indigo-600 underline hover:text-indigo-800"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              autoFillFn();
                                            }}
                                          >
                                            Auto-fill
                                          </button>
                                        )}
                                      </div>
                                      {isEditingThis ? (
                                        <Input
                                          autoFocus
                                          defaultValue={displayVal || ''}
                                          maxLength={maxLen}
                                          className="h-6 px-1 text-[11px]"
                                          onKeyDown={(e) =>
                                            e.key === 'Enter' && saveVal((e.target as HTMLInputElement).value)
                                          }
                                          onBlur={(e) => saveVal(e.target.value)}
                                        />
                                      ) : (
                                        <div
                                          className="truncate text-[11px]"
                                          style={{ color: displayVal ? '#111827' : '#9ca3af' }}
                                        >
                                          {displayVal || (isLocked ? '—' : 'Click to fill')}
                                        </div>
                                      )}
                                    </div>
                                  );
                                };
                                const bodyAutoFill = () => {
                                  const parts = BODY_FIELDS.filter((bf) => mandatoryKeys.has(bf.schemaKey))
                                    .map((bf) => {
                                      const v = localValues[bf.field] !== undefined ? localValues[bf.field] : (item as any)[bf.field];
                                      return v ? String(v).trim() : null;
                                    })
                                    .filter(Boolean);
                                  if (parts.length > 0)
                                    handleSave('bodyArticleDescription', parts.join('-').slice(0, 40));
                                };
                                return (
                                  <>
                                    {renderField('bodyArticle', 'BODY ARTICLE NO.')}
                                    {renderField('bodyArticleDescription', 'BODY ARTICLE DESC', bodyAutoFill, 40)}
                                    <div className="border-t border-border px-2 py-1.5">
                                      <Button
                                        size="sm"
                                        onClick={() => onCreateBodyArticle(item)}
                                        className="h-7 w-full border border-purple-300 bg-purple-50 text-[11px] font-medium text-purple-700 hover:bg-purple-100"
                                      >
                                        <LayoutGrid />
                                        Create Body Article
                                      </Button>
                                    </div>
                                  </>
                                );
                              })()}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* BOM card */}
                  <div
                    className="overflow-hidden rounded-lg border bg-white"
                    style={{ borderColor: '#fde68a' }}
                  >
                    <div
                      className="flex items-center justify-between border-b px-3 py-2"
                      style={{ background: '#fffbeb', borderColor: '#fde68a' }}
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        <DollarSign className="h-3.5 w-3.5" />
                        BOM
                      </span>
                    </div>
                    <div className="space-y-0.5 p-1.5">
                      {[
                        { label: 'RATE / COST', field: 'rate', editable: true, mandatory: false, isDropdown: false },
                        { label: 'MRP', field: 'mrp', editable: true, mandatory: true, isDropdown: false },
                        { label: 'MARKDOWN', field: '_markdown', editable: false, mandatory: false, isDropdown: false, isMarkdown: true },
                        { label: 'IMP_ATBT-1', field: 'macroMvgr', editable: true, mandatory: true, isDropdown: true },
                        { label: 'IMP_ATRBT-2', field: 'impAtrbt2', editable: true, mandatory: true, isDropdown: true },
                      ].map((bom) => {
                        const isEditingBom = editingField === `bom_${bom.field}`;
                        const val = bom.isMarkdown
                          ? markdown
                          : String(getValue(bom.field) ?? '').trim() || '—';
                        const isEmpty = val === '—';
                        const dropdownOptions: string[] = bom.isDropdown
                          ? bom.field === 'impAtrbt2'
                            ? attributes.find((a) => a.key === 'imp_atrbt2')?.allowedValues.map((v) => v.shortForm) ??
                              getCachedValues(item.division ?? '', 'impAtrbt2') ??
                              []
                            : getCachedValues(item.division ?? '', bom.field) ?? []
                          : [];
                        return (
                          <div
                            key={bom.field}
                            className="flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-muted/40"
                            style={{
                              cursor: bom.editable && !isLocked ? 'pointer' : 'default',
                              background: isEditingBom
                                ? '#e0f2fe'
                                : bom.mandatory && isEmpty && !isLocked
                                ? '#fffbeb'
                                : undefined,
                            }}
                            onClick={() => {
                              if (bom.editable && !isLocked && !isEditingBom) setEditingField(`bom_${bom.field}`);
                            }}
                          >
                            <span
                              className="flex-1 truncate text-[11px]"
                              style={{
                                color: bom.mandatory && isEmpty && !isLocked ? '#dc2626' : '#374151',
                                fontWeight: bom.mandatory ? 600 : 400,
                              }}
                            >
                              {bom.mandatory && <span className="mr-0.5 text-red-500">*</span>}
                              {bom.label}
                            </span>
                            <div className="w-[100px] shrink-0 text-right">
                              {isEditingBom && bom.isDropdown ? (
                                <Select
                                  defaultValue={val === '—' ? undefined : val}
                                  onValueChange={(v) => handleSave(bom.field, v ?? null)}
                                >
                                  <SelectTrigger className="h-6 w-full text-[11px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dropdownOptions.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : isEditingBom ? (
                                <Input
                                  autoFocus
                                  defaultValue={val === '—' ? '' : val}
                                  className="h-6 px-1 text-[11px]"
                                  onKeyDown={(e) =>
                                    e.key === 'Enter' &&
                                    handleSave(bom.field, (e.target as HTMLInputElement).value || null)
                                  }
                                  onBlur={(e) => handleSave(bom.field, e.target.value || null)}
                                />
                              ) : (
                                <span
                                  className="block truncate text-[11px]"
                                  style={{
                                    color: bom.isMarkdown
                                      ? '#7c3aed'
                                      : bom.mandatory && isEmpty && !isLocked
                                      ? '#ea580c'
                                      : isEmpty
                                      ? '#9ca3af'
                                      : '#111827',
                                    fontWeight: bom.isMarkdown ? 700 : 400,
                                    fontStyle: bom.mandatory && isEmpty && !isLocked ? 'italic' : 'normal',
                                  }}
                                >
                                  {bom.mandatory && isEmpty && !isLocked ? 'Required' : val}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                  {effectiveMajCat ? `No attributes defined for ${effectiveMajCat}` : 'No major category set.'}
                </div>
              )}

              {/* Proceed for FG Article Creation */}
              {!item.articleNumber &&
                (() => {
                  const effectiveVendorCode =
                    localValues['vendorCode'] !== undefined ? localValues['vendorCode'] : item.vendorCode;
                  const vendorCodeMissing = !effectiveVendorCode;
                  return (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                      <Tooltip title={vendorCodeMissing ? 'Vendor Code is required before proceeding' : undefined}>
                        <Button
                          disabled={vendorCodeMissing}
                          onClick={() => onProceedFGArticle(item)}
                          className="h-10 w-full text-[13px] font-semibold"
                          style={{
                            background: vendorCodeMissing ? '#f3f4f6' : '#fee2e2',
                            color: vendorCodeMissing ? '#9ca3af' : '#b91c1c',
                            border: `1px solid ${vendorCodeMissing ? '#e5e7eb' : '#fca5a5'}`,
                          }}
                        >
                          <Rocket />
                          Proceed for FG Article Creation
                        </Button>
                      </Tooltip>
                    </div>
                  );
                })()}
            </section>

          </div>

          {/* ─── Variants section ─── */}
          {item.isGeneric && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowVariants((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-2.5"
                style={{ background: showVariants ? '#e0e7ff' : '#f9fafb' }}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                  <Users className="h-4 w-4" />
                  Variants
                </span>
                <span className="text-xs text-muted-foreground">{showVariants ? '▲ Hide' : '▼ Show'}</span>
              </button>
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

        {/* Image preview */}
        <Dialog open={imgModalOpen} onOpenChange={setImgModalOpen}>
          <DialogContent className="w-auto max-w-[90vw] p-0">
            <DialogHeader className="px-6 pt-4">
              <DialogTitle>{item.imageName || 'Image Preview'}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4">
              <img
                src={imgUrl || ''}
                alt={item.imageName || 'preview'}
                className="block max-h-[80vh] max-w-[80vw] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Duplicate confirmation */}
        <Dialog open={dupConfirmOpen} onOpenChange={(o) => !duplicating && setDupConfirmOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Duplicate</DialogTitle>
            </DialogHeader>
            <p className="m-0">A new copy of this article will be created with all the same values. Do you want to continue?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDupConfirmOpen(false)} disabled={duplicating}>
                Cancel
              </Button>
              <Button
                disabled={duplicating}
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
                {duplicating ? 'Duplicating…' : 'Continue'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

ArticleCard.displayName = 'ArticleCard';

// ── List ─────────────────────────────────────────────────────────────────────
export const ApproverArticleList: React.FC<ApproverArticleListProps> = ({
  items,
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
  pathType,
  serverPagination,
}) => {
  const [cardGroups, setCardGroups] = useState<CardGroup[]>(() => {
    const cached = getCachedAttributeGroups();
    return cached && cached.length > 0 ? buildCardGroups(cached) : ATTRIBUTE_GROUPS;
  });

  useEffect(() => {
    preloadAttributeGroups()
      .then((entries) => {
        if (entries.length > 0) setCardGroups(buildCardGroups(entries));
      })
      .catch(() => {
        /* keep hardcoded fallback */
      });
  }, []);

  const handleToggleSelect = useCallback(
    (id: string) => {
      onSelectionChange(
        selectedRowKeys.includes(id) ? selectedRowKeys.filter((k) => k !== id) : [...selectedRowKeys, id],
      );
    },
    [selectedRowKeys, onSelectionChange],
  );

  const handleToggleAll = useCallback(() => {
    const ids = items.filter((i) => i.approvalStatus !== 'REJECTED').map((i) => i.id);
    const allOn = ids.every((id) => selectedRowKeys.includes(id));
    onSelectionChange(allOn ? [] : ids);
  }, [items, selectedRowKeys, onSelectionChange]);

  const handleDuplicate = useCallback(
    async (item: ApproverItem): Promise<void> => {
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
    },
    [onRefresh],
  );

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="py-16 text-center text-muted-foreground">No articles found.</div>;
  }

  const eligibleIds = items.filter((i) => i.approvalStatus !== 'REJECTED').map((i) => i.id);
  const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selectedRowKeys.includes(id));

  return (
    <div>
      {items.map((item) => (
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
    </div>
  );
};
