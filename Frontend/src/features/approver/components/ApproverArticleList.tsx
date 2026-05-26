import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FileText, LayoutGrid, Rocket, Info, Users, Copy } from 'lucide-react';
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

    return (
      <>
        <div
          className="mb-2.5 flex overflow-hidden rounded-lg border"
          style={{ borderColor, background: bgColor }}
        >
          {/* Left: checkbox + image */}
          <div className="flex shrink-0 flex-col items-center gap-1.5 border-r border-border bg-black/[0.01] px-2 py-2.5">
            <Checkbox
              checked={isSelected}
              disabled={item.approvalStatus === 'REJECTED'}
              onCheckedChange={() => onToggleSelect(item.id)}
            />
            <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md bg-muted">
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt=""
                  width={72}
                  height={72}
                  className="block cursor-pointer object-cover"
                  onError={handleImgError}
                  onClick={() => setImgModalOpen(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  No Img
                </div>
              )}
            </div>
          </div>

          {/* Right: header info + attributes */}
          <div className="min-w-0 flex-1">
            <div className="border-b border-border pl-3 pr-3 pt-1.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Tag
                  style={{
                    background: status.color + '22',
                    color: status.color,
                    borderColor: status.color + '44',
                  }}
                  className="m-0 px-1.5 text-[10px] leading-[16px]"
                >
                  {status.label}
                </Tag>
                {item.sapSyncMessage && (
                  <Tooltip
                    title={
                      <div className="max-h-[260px] overflow-y-auto text-xs text-foreground">
                        <div className="mb-1.5 text-[13px] font-bold text-red-700">⚠ SAP Remark</div>
                        <div className="whitespace-pre-wrap leading-relaxed">{item.sapSyncMessage}</div>
                      </div>
                    }
                    side="bottom"
                  >
                    <Info className="h-3.5 w-3.5 shrink-0 cursor-pointer text-red-700" />
                  </Tooltip>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {[formatDivisionLabel(item.division), item.subDivision].filter(Boolean).join(' › ')}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {[item.designNumber && `Design: ${item.designNumber}`, item.vendorName].filter(Boolean).join('  ·  ')}
                  {item.rate != null && `  ·  ₹${item.rate}`}
                  {item.mrp != null && Number(item.mrp) > 1 && ` / ₹${item.mrp}`}
                  {item.createdAt && (
                    <span className="ml-2 text-muted-foreground">
                      ·{' '}
                      {new Date(item.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </span>
                {item.pptNumber && (
                  <Badge className="ml-1.5 shrink-0 bg-indigo-500 px-1.5 py-0 text-[10px] font-semibold tracking-wider text-white">
                    {item.pptNumber}
                  </Badge>
                )}
                {pathType === 'new' && item.approvalStatus === 'PENDING' && item.division?.toUpperCase() === 'KIDS' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDupConfirmOpen(true)}
                    className="ml-1.5 h-[22px] shrink-0 border-sky-300 bg-sky-50 px-2 text-[11px] text-sky-700"
                  >
                    <Copy />
                    Duplicate
                  </Button>
                )}
              </div>

              {/* 7 horizontal info fields — click to edit */}
              <div className="flex border-t border-border">
                {(
                  [
                    { label: 'MAJOR CATEGORY', field: 'majorCategory', bold: true, color: '#2f54eb', editable: true, required: false },
                    {
                      label: 'ARTICLE NUMBER',
                      field: 'articleNumber',
                      bold: true,
                      color: item.sapArticleId ? '#389e0d' : '#1d39c4',
                      editable: !item.sapArticleId,
                      required: false,
                    },
                    { label: 'VENDOR CODE', field: 'vendorCode', bold: false, color: '#1a1a1a', editable: true, required: true },
                    { label: 'VENDOR NAME', field: 'vendorName', bold: false, color: '#1a1a1a', editable: true, required: true },
                    { label: 'ARTICLE DESC', field: 'articleDescription', bold: false, color: '#595959', editable: true, required: false },
                    { label: 'REFERENCE ARTICLE', field: 'referenceArticleNumber', bold: false, color: '#1a1a1a', editable: true, required: false },
                    { label: 'REFERENCE ARTICLE DESC', field: 'referenceArticleDescription', bold: false, color: '#1a1a1a', editable: true, required: false },
                  ] as {
                    label: string;
                    field: string;
                    bold: boolean;
                    color: string;
                    editable: boolean;
                    required: boolean;
                  }[]
                ).map(({ label, field, color, editable, required }, i) => {
                  const value =
                    field === 'articleNumber'
                      ? item.sapArticleId || (item as any)[field]
                      : field === 'majorCategory'
                      ? effectiveMajCat || (item as any)[field]
                      : (item as any)[field];
                  const displayVal = localValues[field] !== undefined ? localValues[field] : value;
                  const isEditingThis = editingField === `hdr_${field}`;
                  const canEdit = editable && !isLocked;
                  const isEmpty = !displayVal;
                  const showRequiredError = required && isEmpty && !isLocked;
                  return (
                    <div
                      key={i}
                      className="min-w-0 border-r border-border px-2.5 py-1 last:border-r-0"
                      style={{
                        flex: i >= 4 ? 2 : 1,
                        cursor: canEdit ? 'pointer' : 'default',
                        background: isEditingThis ? '#e6f7ff' : 'transparent',
                      }}
                      onClick={() => {
                        if (canEdit && !isEditingThis) setEditingField(`hdr_${field}`);
                      }}
                    >
                      <div
                        className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{ color: showRequiredError ? '#ff4d4f' : '#8c8c8c' }}
                      >
                        {label}
                        {required && <span className="ml-0.5 text-red-500">*</span>}
                      </div>
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
                        <div
                          className="truncate text-xs"
                          style={{
                            color: displayVal ? color : showRequiredError ? '#fa8c16' : '#bfbfbf',
                            fontStyle: showRequiredError ? 'italic' : 'normal',
                          }}
                        >
                          {displayVal || (showRequiredError ? 'Required' : canEdit ? 'Click to fill' : '—')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attribute groups */}
            {visibleAttrs.length > 0 ? (
              <div className="flex items-start gap-1 border-t-2 border-neutral-400 bg-neutral-200 p-1">
                {activeGroups.map((g) => (
                  <div
                    key={g.group}
                    className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-300 bg-background shadow-sm"
                  >
                    <div
                      className="border-b border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                      style={{ background: g.color }}
                    >
                      {g.group}
                    </div>
                    <table className="w-full border-collapse">
                      <tbody>
                        {groupMap[g.group].attrs.map(({ field, label, schemaKey, values, freeText }) => {
                          const currentValue = getValue(field);
                          const isEmpty = !currentValue;
                          const isMandatory = !freeText && mandatoryKeys.has(schemaKey);
                          const isEditing = editingField === field;
                          const artNum = getArtNum(schemaKey, field, currentValue);
                          const isEditingArtNum = editingField === `artnum_${field}`;
                          return (
                            <tr key={field} className="border-b border-neutral-100 last:border-b-0">
                              <td
                                className="overflow-hidden truncate whitespace-nowrap border-r border-border bg-muted/40 px-2 py-1 align-middle text-[11px]"
                                style={{
                                  fontWeight: isMandatory ? 600 : 400,
                                  color: isMandatory ? '#262626' : '#595959',
                                  maxWidth: 120,
                                }}
                              >
                                {isMandatory && <span className="mr-0.5 text-red-500">*</span>}
                                {label}
                              </td>
                              {!freeText && (
                                <td
                                  className="border-r border-border bg-muted/40 px-1.5 py-0.5 align-middle"
                                  style={{
                                    cursor: isLocked ? 'default' : 'pointer',
                                    background: isEditingArtNum ? '#e6f7ff' : undefined,
                                    minWidth: 70,
                                    maxWidth: 90,
                                  }}
                                  onClick={() => {
                                    if (!isLocked && !isEditingArtNum) setEditingField(`artnum_${field}`);
                                  }}
                                >
                                  {isEditingArtNum ? (
                                    <Input
                                      autoFocus
                                      defaultValue={artNum}
                                      className="h-6 w-full px-1 text-[10px]"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          saveAttrArticleNum(field, (e.target as HTMLInputElement).value);
                                          setEditingField(null);
                                        }
                                      }}
                                      onBlur={(e) => {
                                        saveAttrArticleNum(field, e.target.value);
                                        setEditingField(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="text-[10px]"
                                      style={{
                                        color: artNum ? '#1d39c4' : '#d9d9d9',
                                        fontStyle: artNum ? 'normal' : 'italic',
                                      }}
                                    >
                                      {artNum || 'Art #'}
                                    </span>
                                  )}
                                </td>
                              )}
                              <td
                                colSpan={freeText ? 2 : 1}
                                className="px-2 py-0.5 align-middle"
                                style={{
                                  cursor: isLocked ? 'default' : 'pointer',
                                  background: isEditing
                                    ? '#e6f7ff'
                                    : isEmpty && isMandatory
                                    ? '#fff7e6'
                                    : 'transparent',
                                }}
                                onClick={() => {
                                  if (!isLocked && !isEditing) setEditingField(field);
                                }}
                              >
                                {freeText ? (
                                  isEditing ? (
                                    <Input
                                      autoFocus
                                      defaultValue={currentValue || ''}
                                      className="h-6 w-full text-[11px]"
                                      onKeyDown={(e) =>
                                        e.key === 'Enter' && handleSave(field, (e.target as HTMLInputElement).value || null)
                                      }
                                      onBlur={(e) => handleSave(field, e.target.value || null)}
                                    />
                                  ) : (
                                    <span
                                      className="text-[11px]"
                                      style={{
                                        color: isEmpty ? '#bfbfbf' : '#1a1a1a',
                                        fontStyle: isEmpty ? 'italic' : 'normal',
                                      }}
                                    >
                                      {currentValue || '—'}
                                    </span>
                                  )
                                ) : isEditing ? (
                                  <Select
                                    defaultValue={currentValue || undefined}
                                    onValueChange={(val) => handleSave(field, val ?? null)}
                                  >
                                    <SelectTrigger className="h-6 w-full min-w-[120px] text-[11px]">
                                      <SelectValue />
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
                                  <span className="flex items-center gap-1">
                                    <span
                                      className="flex-1 text-[11px]"
                                      style={{
                                        color: isEmpty ? (isMandatory ? '#fa8c16' : '#bfbfbf') : '#1a1a1a',
                                        fontStyle: isEmpty ? 'italic' : 'normal',
                                      }}
                                    >
                                      {currentValue || (isMandatory ? 'Required' : '—')}
                                    </span>
                                    {currentValue && !isLocked && (
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSave(field, null);
                                        }}
                                        className="shrink-0 cursor-pointer px-0.5 text-[10px] leading-none text-muted-foreground"
                                        title="Clear"
                                      >
                                        ✕
                                      </span>
                                    )}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {g.group === 'FAB' && (
                      <>
                        {renderFabBodyField('fabricArticleNumber', 'FABRIC ARTICLE NO.')}
                        {renderFabBodyField(
                          'fabricArticleDescription',
                          'FABRIC ARTICLE DESC',
                          () => {
                            const parts = FAB_FIELDS.filter((f) => mandatoryKeys.has(f.schemaKey))
                              .map((f) => {
                                const v = localValues[f.field] !== undefined ? localValues[f.field] : (item as any)[f.field];
                                return v ? String(v).trim() : null;
                              })
                              .filter(Boolean);
                            if (parts.length > 0) handleSave('fabricArticleDescription', parts.join('-').slice(0, 40));
                          },
                          40,
                        )}
                        <div className="border-t border-border px-2 py-1.5">
                          <Button
                            onClick={() => onCreateFabricArticle(item)}
                            className="h-7 w-full border border-indigo-300 bg-indigo-50 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            <FileText />
                            Create Fabric Article
                          </Button>
                        </div>
                      </>
                    )}
                    {g.group === 'BODY' && (
                      <>
                        {renderFabBodyField('bodyArticle', 'BODY ARTICLE NO.')}
                        {renderFabBodyField(
                          'bodyArticleDescription',
                          'BODY ARTICLE DESC',
                          () => {
                            const parts = BODY_FIELDS.filter((f) => mandatoryKeys.has(f.schemaKey))
                              .map((f) => {
                                const v = localValues[f.field] !== undefined ? localValues[f.field] : (item as any)[f.field];
                                return v ? String(v).trim() : null;
                              })
                              .filter(Boolean);
                            if (parts.length > 0) handleSave('bodyArticleDescription', parts.join('-').slice(0, 40));
                          },
                          40,
                        )}
                        <div className="border-t border-border px-2 py-1.5">
                          <Button
                            onClick={() => onCreateBodyArticle(item)}
                            className="h-7 w-full border border-purple-300 bg-purple-50 text-[11px] font-medium text-purple-700 hover:bg-purple-100"
                          >
                            <LayoutGrid />
                            Create Body Article
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* BOM group — always shown */}
                <div className="min-w-[120px] flex-1 overflow-hidden rounded-md border border-neutral-300 bg-background shadow-sm">
                  <div className="border-b border-border bg-purple-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    BOM
                  </div>
                  <table className="w-full border-collapse">
                    <tbody>
                      {[
                        { label: 'RATE / COST', field: 'rate', editable: true, mandatory: false },
                        { label: 'MRP', field: 'mrp', editable: true, mandatory: true },
                        { label: 'MARKDOWN', field: '_markdown', editable: false, mandatory: false },
                        { label: 'IMP_ATBT-1', field: 'macroMvgr', editable: true, mandatory: true },
                        { label: 'IMP_ATRBT-2', field: 'impAtrbt2', editable: true, mandatory: true },
                      ].map(({ label, field, editable, mandatory }) => {
                        const isEditingBom = editingField === `bom_${field}`;
                        const val = field === '_markdown' ? markdown : String(getValue(field) ?? '').trim() || '—';
                        const isEmpty = val === '—';
                        const isDropdown = field === 'impAtrbt2' || field === 'macroMvgr';
                        const dropdownOptions: string[] = isDropdown
                          ? field === 'impAtrbt2'
                            ? attributes.find((a) => a.key === 'imp_atrbt2')?.allowedValues.map((v) => v.shortForm) ??
                              getCachedValues(item.division ?? '', 'impAtrbt2') ??
                              []
                            : getCachedValues(item.division ?? '', field) ?? []
                          : [];
                        return (
                          <tr key={field} className="border-b border-neutral-100 last:border-b-0">
                            <td
                              className="whitespace-nowrap border-r border-border bg-muted/40 px-2 py-1 align-middle text-[11px]"
                              style={{ color: mandatory && isEmpty && !isLocked ? '#ff4d4f' : '#595959' }}
                            >
                              {label}
                              {mandatory && <span className="ml-0.5 text-red-500">*</span>}
                            </td>
                            <td
                              className="px-2 py-0.5 align-middle"
                              style={{
                                cursor: editable && !isLocked ? 'pointer' : 'default',
                                background: isEditingBom ? '#e6f7ff' : 'transparent',
                              }}
                              onClick={() => {
                                if (editable && !isLocked && !isEditingBom) setEditingField(`bom_${field}`);
                              }}
                            >
                              {isEditingBom && isDropdown ? (
                                <Select
                                  defaultValue={val === '—' ? undefined : val}
                                  onValueChange={(v) => handleSave(field, v ?? null)}
                                >
                                  <SelectTrigger className="h-6 w-full min-w-[140px] text-[11px]">
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
                                  className="h-6 w-full text-[11px]"
                                  onKeyDown={(e) =>
                                    e.key === 'Enter' && handleSave(field, (e.target as HTMLInputElement).value || null)
                                  }
                                  onBlur={(e) => handleSave(field, e.target.value || null)}
                                />
                              ) : (
                                <span
                                  className="text-[11px]"
                                  style={{
                                    color:
                                      field === '_markdown'
                                        ? '#7c3aed'
                                        : mandatory && isEmpty && !isLocked
                                        ? '#fa8c16'
                                        : isEmpty
                                        ? '#bfbfbf'
                                        : '#1a1a1a',
                                    fontStyle: mandatory && isEmpty && !isLocked ? 'italic' : 'normal',
                                    fontWeight: field === '_markdown' ? 600 : 400,
                                  }}
                                >
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
            ) : (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                {effectiveMajCat ? `No attributes defined for ${effectiveMajCat}` : 'No major category set.'}
              </div>
            )}

            {/* Proceed for FG Article Creation */}
            {!item.articleNumber &&
              (() => {
                const effectiveVendorCode = localValues['vendorCode'] !== undefined ? localValues['vendorCode'] : item.vendorCode;
                const vendorCodeMissing = !effectiveVendorCode;
                return (
                  <div className="border-t border-border bg-muted/40 px-3 py-2">
                    <Tooltip title={vendorCodeMissing ? 'Vendor Code is required before proceeding' : undefined}>
                      <Button
                        disabled={vendorCodeMissing}
                        onClick={() => onProceedFGArticle(item)}
                        className="h-9 w-full text-[13px] font-semibold"
                        style={{
                          background: vendorCodeMissing ? '#f5f5f5' : '#fff0ee',
                          color: vendorCodeMissing ? '#bfbfbf' : '#c94f44',
                          border: `1px solid ${vendorCodeMissing ? '#d9d9d9' : '#f5c2bc'}`,
                        }}
                      >
                        <Rocket />
                        Proceed for FG Article Creation
                      </Button>
                    </Tooltip>
                  </div>
                );
              })()}

            {/* Variants */}
            {item.isGeneric && (
              <div className="border-t border-border">
                <div
                  className="flex cursor-pointer select-none items-center justify-between px-3 py-1.5"
                  style={{ background: showVariants ? '#e6f4ff' : 'rgb(250 250 250)' }}
                  onClick={() => setShowVariants((v) => !v)}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                    <Users className="h-3.5 w-3.5" />
                    Variants
                  </span>
                  <span className="text-[11px] text-muted-foreground">{showVariants ? '▲ Hide' : '▼ Show'}</span>
                </div>
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
    <div className="pb-[300px]">
      <div className="mb-2 flex items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-1.5">
        <Checkbox checked={allSelected} onCheckedChange={handleToggleAll} />
        <span className="text-xs font-semibold text-muted-foreground">Select All on Page</span>
        {selectedRowKeys.length > 0 && <Badge variant="warning">{selectedRowKeys.length} selected</Badge>}
      </div>

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

      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          {(serverPagination.current - 1) * serverPagination.pageSize + 1}–
          {Math.min(serverPagination.current * serverPagination.pageSize, serverPagination.total)} of{' '}
          {serverPagination.total}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => serverPagination.onChange(serverPagination.current - 1)}
          disabled={serverPagination.current <= 1}
        >
          ‹
        </Button>
        <span className="text-xs font-semibold">{serverPagination.current}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => serverPagination.onChange(serverPagination.current + 1)}
          disabled={serverPagination.current * serverPagination.pageSize >= serverPagination.total}
        >
          ›
        </Button>
      </div>
    </div>
  );
};
