/**
 * CategoryAttributeMapper
 * Primary admin tab for managing which attributes are enabled per category.
 *
 * Layout:
 *   Left (280px) — scrollable category list grouped by department, with search
 *   Right (flex) — attribute toggle table for the selected category
 *
 * Clicking a category in the hierarchy tab passes it in via `initialCategory`
 * so the user lands directly on the right category.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Input, Typography, Space, Tag, Empty, Spin, Switch, Table,
  Button, Select, Badge, message,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHierarchyTree, getCategoryWithAllAttributes,
  updateCategoryAttributeMapping, updateCategory,
} from '../../../services/adminApi';
import type { SelectedCategory } from './HierarchyTreeEditor';

const { Text } = Typography;

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

  // Reset local changes when category changes
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
      isEnabled: localChanges[a.attributeId]?.isEnabled ?? a.isEnabled ?? false,
      isRequired: localChanges[a.attributeId]?.isRequired ?? a.isRequired ?? false,
    }));
  }, [catAttrs, localChanges]);

  const enabledCount = rows.filter(r => r.isEnabled).length;
  const changedCount = Object.keys(localChanges).length;

  const handleToggle = (attrId: number, field: 'isEnabled' | 'isRequired', value: boolean) => {
    setLocalChanges(prev => {
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
      } catch { /* skip */ }
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
    setLocalChanges(prev => ({ ...prev, ...changes }));
  };

  const columns = [
    {
      title: 'Key',
      key: 'key',
      width: 140,
      render: (_: any, r: AttrRow) => (
        <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.attrKey}</Tag>
      ),
    },
    {
      title: 'Attribute Name',
      key: 'label',
      render: (_: any, r: AttrRow) => <Text style={{ fontSize: 13 }}>{r.attrLabel}</Text>,
    },
    {
      title: 'Type',
      key: 'type',
      width: 80,
      render: (_: any, r: AttrRow) => (
        <Tag color="geekblue" style={{ fontSize: 11 }}>{r.attrType}</Tag>
      ),
    },
    {
      title: () => (
        <Space>
          <span>Enabled</span>
          <Badge count={enabledCount} style={{ backgroundColor: '#52c41a' }} />
        </Space>
      ),
      key: 'enabled',
      width: 90,
      render: (_: any, r: AttrRow) => (
        <Switch size="small" checked={r.isEnabled} onChange={v => handleToggle(r.attributeId, 'isEnabled', v)} />
      ),
    },
    {
      title: 'Required',
      key: 'required',
      width: 90,
      render: (_: any, r: AttrRow) => (
        <Switch size="small" checked={r.isRequired} disabled={!r.isEnabled} onChange={v => handleToggle(r.attributeId, 'isRequired', v)} />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Category header */}
      <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Selected Category</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <Text strong style={{ fontSize: 18 }}>{category.name}</Text>
              <Tag style={{ fontFamily: 'monospace' }}>{category.code}</Tag>
              <Tag color="blue">{category.departmentName}</Tag>
            </div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Garment Type</Text>
            <Select
              value={garmentType}
              options={GARMENT_TYPES}
              onChange={saveGarmentType}
              style={{ width: 260 }}
              size="small"
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <Button size="small" onClick={() => toggleAll(true)}>Enable All</Button>
          <Button size="small" onClick={() => toggleAll(false)}>Disable All</Button>
          {changedCount > 0 && (
            <Tag color="orange">{changedCount} unsaved change{changedCount !== 1 ? 's' : ''}</Tag>
          )}
        </Space>
        <Button
          type="primary" icon={<SaveOutlined />} size="small"
          loading={saving} disabled={!changedCount}
          onClick={saveAll}
        >
          Save Changes
        </Button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Spin spinning={isLoading}>
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="attributeId"
            size="small"
            pagination={false}
            scroll={{ y: 'calc(75vh - 220px)' }}
            rowClassName={r => localChanges[r.attributeId] ? 'attr-row-changed' : ''}
          />
        </Spin>
      </div>

      <style>{`.attr-row-changed { background: #fffbe6 !important; }`}</style>
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

  // Jump to category when navigated from hierarchy tab
  useEffect(() => {
    if (initialCategory) {
      setSelectedCat(initialCategory);
    }
  }, [initialCategory?.id]);

  const { data: hierarchyData, isLoading } = useQuery({
    queryKey: ['hierarchy-tree'],
    queryFn: getHierarchyTree,
  });

  // Flatten all categories with dept + sub info + enabled count
  const allCategories = useMemo(() => {
    if (!Array.isArray(hierarchyData)) return [];
    return (hierarchyData as any[]).flatMap(dept =>
      (dept.subDepartments ?? []).flatMap((sub: any) =>
        (sub.categories ?? []).map((cat: any) => ({
          cat,
          dept,
          sub,
          enabledCount: (cat.attributes ?? []).filter((a: any) => a.isEnabled).length,
          totalCount: (cat.attributes ?? []).length,
        }))
      )
    );
  }, [hierarchyData]);

  // Group by department, filtered by search
  const grouped = useMemo(() => {
    const lower = searchText.toLowerCase().trim();
    const filtered = lower
      ? allCategories.filter(({ cat, sub, dept }) =>
          cat.name.toLowerCase().includes(lower) ||
          cat.code.toLowerCase().includes(lower) ||
          sub.name.toLowerCase().includes(lower) ||
          dept.name.toLowerCase().includes(lower)
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
    <div style={{ display: 'flex', height: '78vh', border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>

      {/* ── Left: category browser ── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        {/* Search */}
        <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
          <Input.Search
            placeholder={`Search ${totalCats} categories…`}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            size="small"
          />
        </div>

        {/* Category list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Spin spinning={isLoading} size="small" style={{ margin: 20 }}>
            {Object.entries(grouped).map(([deptName, items]) => (
              <div key={deptName}>
                {/* Department section header */}
                <div style={{
                  padding: '6px 14px 4px',
                  background: '#f0f0f0',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#555',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}>
                  {deptName}
                </div>

                {/* Category rows */}
                {items.map(({ cat, sub, enabledCount, totalCount }) => {
                  const isSelected = selectedCat?.id === cat.id;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCat({
                        id: cat.id,
                        name: cat.name,
                        code: cat.code,
                        garmentType: cat.garmentType ?? 'UPPER',
                        departmentName: cat.dept ?? sub.dept?.name ?? '',
                      })}
                      style={{
                        padding: '8px 14px',
                        cursor: 'pointer',
                        borderLeft: isSelected ? '3px solid #1890ff' : '3px solid transparent',
                        background: isSelected ? '#e6f7ff' : 'transparent',
                        transition: 'background 0.12s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                      className="cat-picker-row"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Tag style={{ fontFamily: 'monospace', fontSize: 10, margin: 0, flexShrink: 0 }}>
                            {cat.code}
                          </Tag>
                          <Text
                            style={{ fontSize: 12, lineHeight: 1.3 }}
                            ellipsis={{ tooltip: cat.name }}
                          >
                            {cat.name}
                          </Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>{sub.name}</Text>
                      </div>
                      <Tag
                        color={enabledCount > 0 ? 'green' : 'default'}
                        style={{ fontSize: 10, margin: 0, flexShrink: 0 }}
                      >
                        {enabledCount}/{totalCount}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            ))}

            {Object.keys(grouped).length === 0 && !isLoading && (
              <Empty
                description={searchText ? `No results for "${searchText}"` : 'No categories found'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginTop: 40 }}
              />
            )}
          </Spin>
        </div>

        {/* Footer hint */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #f0f0f0', background: '#f5f5f5' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {totalCats} categories · click to edit attributes
          </Text>
        </div>
      </div>

      {/* ── Right: attribute table ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {selectedCat ? (
          <AttributeTable key={selectedCat.id} category={selectedCat} />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 100 }}
            description={
              <Space direction="vertical" size={6}>
                <Text strong style={{ fontSize: 15 }}>Select a category</Text>
                <Text type="secondary">
                  Pick any category from the left panel to view and manage its attributes.
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  The <strong>Enabled</strong> count (e.g. 23/45) shows how many attributes
                  are currently active for extraction.
                </Text>
              </Space>
            }
          />
        )}
      </div>

      <style>{`
        .cat-picker-row:hover { background: #f0f7ff !important; }
      `}</style>
    </div>
  );
};
