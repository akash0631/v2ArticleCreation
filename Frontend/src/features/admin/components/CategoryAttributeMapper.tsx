/**
 * CategoryAttributeMapper
 * Primary admin tab for managing which attributes are enabled per category.
 *
 * Left (280px): scrollable category list grouped by department, with search
 * Right (flex): attribute toggle table for the selected category
 */
import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Save } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  DataTable,
  Empty,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  Tag,
  type DataTableColumn,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import {
  getHierarchyTreeLightweight,
  getCategoryWithAllAttributes,
  updateCategoryAttributeMapping,
  updateCategory,
} from '../../../services/adminApi';
import type {
  LightweightDepartment,
  LightweightCategory,
  LightweightSubDepartment,
} from '../../../services/adminApi';
import type { SelectedCategory } from './HierarchyTreeEditor';

const GROUP_ORDER = ['FAB', 'BODY', 'VA ACC.', 'VA PRCS', 'BUSINESS'];
const GROUP_COLORS: Record<string, string> = {
  FAB: '#e6f4ff',
  BODY: '#f6ffed',
  'VA ACC.': '#fff7e6',
  'VA PRCS': '#fff0f6',
  BUSINESS: '#f9f0ff',
};
const GROUP_BORDER: Record<string, string> = {
  FAB: '#91caff',
  BODY: '#95de64',
  'VA ACC.': '#ffd591',
  'VA PRCS': '#ffadd2',
  BUSINESS: '#d3adf7',
};
const GROUP_TEXT: Record<string, string> = {
  FAB: '#0958d9',
  BODY: '#389e0d',
  'VA ACC.': '#d46b08',
  'VA PRCS': '#c41d7f',
  BUSINESS: '#531dab',
};

const GARMENT_TYPES = [
  { value: 'UPPER', label: 'Upper (tops, shirts, jackets)' },
  { value: 'LOWER', label: 'Lower (pants, skirts, bottoms)' },
  { value: 'ALL_IN_ONE', label: 'All-in-one (sets, dresses, coords)' },
];

interface AttrRow {
  attributeId: number;
  attrKey: string;
  attrLabel: string;
  attrType: string;
  attrGroup: string | null;
  isEnabled: boolean;
  isRequired: boolean;
}

// ─── Attribute table for selected category ────────────────────────────────────

const AttributeTable: React.FC<{ category: SelectedCategory }> = ({ category }) => {
  const qc = useQueryClient();
  const [localChanges, setLocalChanges] = useState<Record<number, Partial<AttrRow>>>({});
  const [saving, setSaving] = useState(false);
  const [garmentType, setGarmentType] = useState(category.garmentType);

  const { data: catAttrs, isLoading } = useQuery({
    queryKey: ['category-all-attributes', category.id],
    queryFn: () => getCategoryWithAllAttributes(category.id),
    staleTime: 0,
  });

  useEffect(() => {
    setLocalChanges({});
    setGarmentType(category.garmentType);
  }, [category.id]);

  const rows: AttrRow[] = useMemo(() => {
    if (!catAttrs?.allAttributes) return [];
    return (catAttrs.allAttributes as any[]).map((a: any) => ({
      attributeId: a.attributeId,
      attrKey: a.attributeKey,
      attrLabel: a.attributeLabel,
      attrType: a.attributeType,
      attrGroup: a.attributeGroup ?? null,
      isEnabled: localChanges[a.attributeId]?.isEnabled ?? a.isEnabled ?? false,
      isRequired: localChanges[a.attributeId]?.isRequired ?? a.isRequired ?? false,
    }));
  }, [catAttrs, localChanges]);

  const groupedRows = useMemo(() => {
    const groups: Record<string, AttrRow[]> = {};
    const other: AttrRow[] = [];
    for (const row of rows) {
      if (row.attrGroup && GROUP_ORDER.includes(row.attrGroup)) {
        if (!groups[row.attrGroup]) groups[row.attrGroup] = [];
        groups[row.attrGroup].push(row);
      } else {
        other.push(row);
      }
    }
    return { groups, other };
  }, [rows]);

  const enabledCount = rows.filter((r) => r.isEnabled).length;
  const changedCount = Object.keys(localChanges).length;

  const handleToggle = (attrId: number, field: 'isEnabled' | 'isRequired', value: boolean) => {
    setLocalChanges((prev) => {
      const existing = prev[attrId] || {};
      const next = { ...existing, [field]: value };
      if (field === 'isEnabled' && !value) next.isRequired = false;
      return { ...prev, [attrId]: next };
    });
  };

  const saveAll = async () => {
    if (!changedCount) return;
    setSaving(true);
    const entries = Object.entries(localChanges);
    let ok = 0;
    for (const [id, changes] of entries) {
      try {
        await updateCategoryAttributeMapping(category.id, parseInt(id), changes);
        ok++;
      } catch {
        /* skip */
      }
    }
    message.success(`Saved ${ok}/${entries.length} changes`);
    setLocalChanges({});
    qc.invalidateQueries({ queryKey: ['category-all-attributes', category.id] });
    qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    setSaving(false);
  };

  const saveGarmentType = async (type: string) => {
    try {
      await updateCategory(category.id, { garmentType: type });
      setGarmentType(type);
      message.success('Garment type updated');
      qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    } catch {
      message.error('Update failed');
    }
  };

  const toggleAll = (enable: boolean) => {
    const changes: Record<number, Partial<AttrRow>> = {};
    for (const r of rows) {
      changes[r.attributeId] = { isEnabled: enable, ...(enable ? {} : { isRequired: false }) };
    }
    setLocalChanges((prev) => ({ ...prev, ...changes }));
  };

  const columns: DataTableColumn<AttrRow>[] = [
    {
      title: 'Key',
      key: 'key',
      width: 140,
      render: (_v, r) => <Tag className="font-mono text-[11px]">{r.attrKey}</Tag>,
    },
    {
      title: 'Attribute Name',
      key: 'label',
      render: (_v, r) => <span className="text-[13px]">{r.attrLabel}</span>,
    },
    {
      title: 'Type',
      key: 'type',
      width: 80,
      render: (_v, r) => (
        <Badge variant="info" className="text-[11px]">
          {r.attrType}
        </Badge>
      ),
    },
    {
      title: (
        <span className="flex items-center gap-2">
          <span>Enabled</span>
          <Badge variant="success">{enabledCount}</Badge>
        </span>
      ),
      key: 'enabled',
      width: 90,
      render: (_v, r) => (
        <Switch checked={r.isEnabled} onCheckedChange={(v) => handleToggle(r.attributeId, 'isEnabled', v)} />
      ),
    },
    {
      title: 'Required',
      key: 'required',
      width: 90,
      render: (_v, r) => (
        <Switch
          checked={r.isRequired}
          disabled={!r.isEnabled}
          onCheckedChange={(v) => handleToggle(r.attributeId, 'isRequired', v)}
        />
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col px-5 py-4">
      {/* Category header */}
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3.5">
        <div>
          <span className="text-xs text-muted-foreground">Selected Category</span>
          <div className="mt-0.5 flex items-center gap-2">
            <strong className="text-lg">{category.name}</strong>
            <Tag className="font-mono">{category.code}</Tag>
            <Badge variant="info">{category.departmentName}</Badge>
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">Garment Type</span>
          <Select value={garmentType} onValueChange={saveGarmentType}>
            <SelectTrigger className="h-8 w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GARMENT_TYPES.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
            Enable All
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>
            Disable All
          </Button>
          {changedCount > 0 && (
            <Badge variant="warning">
              {changedCount} unsaved change{changedCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={saveAll} disabled={!changedCount || saving}>
          <Save />
          Save Changes
        </Button>
      </div>

      {/* Grouped attribute sections */}
      <div className="flex-1 overflow-auto">
        <Spinner spinning={isLoading}>
          <Accordion type="multiple" defaultValue={GROUP_ORDER}>
            {GROUP_ORDER.map((groupName) => {
              const groupRows = groupedRows.groups[groupName] || [];
              const enabledInGroup = groupRows.filter((r) => r.isEnabled).length;
              if (groupRows.length === 0) return null;
              return (
                <AccordionItem
                  key={groupName}
                  value={groupName}
                  className="mb-2 overflow-hidden rounded-md border"
                  style={{ borderColor: GROUP_BORDER[groupName], background: GROUP_COLORS[groupName] }}
                >
                  <AccordionTrigger className="px-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: GROUP_TEXT[groupName] }}
                      />
                      <strong className="text-[13px]" style={{ color: GROUP_TEXT[groupName] }}>
                        {groupName}
                      </strong>
                      <Badge style={{ background: enabledInGroup > 0 ? GROUP_TEXT[groupName] : '#d9d9d9' }}>
                        {enabledInGroup}/{groupRows.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="bg-background/40 px-3 pb-3">
                    <DataTable<AttrRow>
                      dataSource={groupRows}
                      columns={columns}
                      rowKey="attributeId"
                      size="small"
                      pagination={false}
                      rowClassName={(r) => (localChanges[r.attributeId] ? 'attr-row-changed' : '')}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            {groupedRows.other.length > 0 && (
              <AccordionItem
                value="__other__"
                className="mb-2 overflow-hidden rounded-md border border-border"
              >
                <AccordionTrigger className="px-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <strong className="text-[13px] text-muted-foreground">Other / Unassigned</strong>
                    <Badge variant="secondary">{groupedRows.other.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <DataTable<AttrRow>
                    dataSource={groupedRows.other}
                    columns={columns}
                    rowKey="attributeId"
                    size="small"
                    pagination={false}
                    rowClassName={(r) => (localChanges[r.attributeId] ? 'attr-row-changed' : '')}
                  />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </Spinner>
      </div>

      <style>{`.attr-row-changed > td { background: #fffbe6 !important; }`}</style>
    </div>
  );
};

// ─── CategoryAttributeMapper ──────────────────────────────────────────────────

interface CategoryAttributeMapperProps {
  initialCategory?: SelectedCategory | null;
}

export const CategoryAttributeMapper: React.FC<CategoryAttributeMapperProps> = ({ initialCategory }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedCat, setSelectedCat] = useState<SelectedCategory | null>(null);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  const toggleDept = (deptName: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptName)) next.delete(deptName);
      else next.add(deptName);
      return next;
    });
  };

  useEffect(() => {
    if (initialCategory) setSelectedCat(initialCategory);
  }, [initialCategory?.id]);

  const { data: hierarchyData, isLoading } = useQuery({
    queryKey: ['hierarchy-tree-lightweight'],
    queryFn: getHierarchyTreeLightweight,
    staleTime: 5 * 60 * 1000,
  });

  const allCategories = useMemo(() => {
    if (!Array.isArray(hierarchyData)) return [];
    return (hierarchyData as LightweightDepartment[]).flatMap((dept) =>
      (dept.subDepartments ?? []).flatMap((sub: LightweightSubDepartment) =>
        (sub.categories ?? []).map((cat: LightweightCategory) => ({
          cat,
          dept,
          sub,
          enabledCount: cat.enabledCount,
          totalCount: cat.totalCount,
        })),
      ),
    );
  }, [hierarchyData]);

  const grouped = useMemo(() => {
    const lower = searchText.toLowerCase().trim();
    const filtered = lower
      ? allCategories.filter(
          ({ cat, sub, dept }) =>
            cat.name.toLowerCase().includes(lower) ||
            cat.code.toLowerCase().includes(lower) ||
            sub.name.toLowerCase().includes(lower) ||
            dept.name.toLowerCase().includes(lower),
        )
      : allCategories;

    const groups: Record<string, typeof allCategories> = {};
    for (const item of filtered) {
      if (!groups[item.dept.name]) groups[item.dept.name] = [];
      groups[item.dept.name].push(item);
    }
    return groups;
  }, [allCategories, searchText]);

  const totalCats = allCategories.length;

  return (
    <div className="flex h-[78vh] overflow-hidden rounded-lg border border-border bg-background">
      {/* Left: category browser */}
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="border-b border-border p-3">
          <Input
            placeholder={`Search ${totalCats} categories…`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            onClear={() => setSearchText('')}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <Spinner spinning={isLoading}>
            {Object.entries(grouped).map(([deptName, items]) => {
              const isCollapsed = collapsedDepts.has(deptName);
              return (
                <div key={deptName}>
                  <div
                    onClick={() => toggleDept(deptName)}
                    className="sticky top-0 z-[1] flex cursor-pointer select-none items-center justify-between bg-muted px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    <span>{deptName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {isCollapsed ? (
                        <span className="inline-flex items-center gap-1">
                          <ChevronRight className="h-3 w-3" /> {items.length}
                        </span>
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </span>
                  </div>

                  {!isCollapsed &&
                    items.map(({ cat, sub, enabledCount, totalCount }) => {
                      const isSelected = selectedCat?.id === cat.id;
                      return (
                        <div
                          key={cat.id}
                          onClick={() =>
                            setSelectedCat({
                              id: cat.id,
                              name: cat.name,
                              code: cat.code,
                              garmentType: cat.garmentType ?? 'UPPER',
                              departmentName: deptName ?? '',
                            })
                          }
                          className="cat-picker-row flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2 transition-colors"
                          style={{
                            borderLeft: isSelected ? '3px solid #1890ff' : '3px solid transparent',
                            background: isSelected ? '#e6f7ff' : 'transparent',
                          }}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Tag className="m-0 shrink-0 font-mono text-[10px]">{cat.code}</Tag>
                              <span className="truncate text-xs leading-tight" title={cat.name}>
                                {cat.name}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{sub.name}</span>
                          </div>
                          <Badge
                            variant={enabledCount > 0 ? 'success' : 'secondary'}
                            className="m-0 shrink-0 text-[10px]"
                          >
                            {enabledCount}/{totalCount}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {Object.keys(grouped).length === 0 && !isLoading && (
              <Empty
                description={searchText ? `No results for "${searchText}"` : 'No categories found'}
                className="mt-10"
              />
            )}
          </Spinner>
        </div>

        <div className="border-t border-border bg-muted px-3.5 py-2">
          <span className="text-[11px] text-muted-foreground">
            {totalCats} categories · click to edit attributes
          </span>
        </div>
      </div>

      {/* Right: attribute table */}
      <div className="flex-1 overflow-hidden">
        {selectedCat ? (
          <AttributeTable key={selectedCat.id} category={selectedCat} />
        ) : (
          <Empty
            className="mt-24"
            description={
              <div className="flex flex-col items-center gap-1.5">
                <strong className="text-[15px]">Select a category</strong>
                <span className="text-sm text-muted-foreground">
                  Pick any category from the left panel to view and manage its attributes.
                </span>
                <span className="text-xs text-muted-foreground">
                  The <strong>Enabled</strong> count (e.g. 23/45) shows how many attributes are currently active for extraction.
                </span>
              </div>
            }
          />
        )}
      </div>

      <style>{`.cat-picker-row:hover { background: #f0f7ff !important; }`}</style>
    </div>
  );
};
