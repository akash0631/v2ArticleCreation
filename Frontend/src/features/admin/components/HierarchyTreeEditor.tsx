/**
 * HierarchyTreeEditor
 * Department cards layout — one card per department, displayed side by side.
 * Attribute mapping is handled in a separate tab (CategoryAttributeMapper).
 */

import { useState, useMemo } from 'react';
import {
  Card, Button, Input, Space, Popconfirm, message, Spin, Table,
  Tag, Tooltip, Typography, Badge, Collapse, Empty, Alert, Divider, Select, Switch,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, CloseOutlined, FolderOutlined,
  TagOutlined, AppstoreOutlined, SaveOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHierarchyTree, getCategoryWithAllAttributes, updateCategoryAttributeMapping,
  createDepartment, updateDepartment, deleteDepartment,
  createSubDepartment, updateSubDepartment, deleteSubDepartment,
  createCategory, updateCategory, deleteCategory,
} from '../../../services/adminApi';

const { Text } = Typography;

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface SelectedCategory {
  id: number;
  name: string;
  code: string;
  garmentType: string;
  departmentName: string;
}

interface AttrRow {
  attributeId: number;
  attrKey: string;
  attrLabel: string;
  attrType: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number;
}

// ─── NodeTitle ────────────────────────────────────────────────────────────────
// Inline rename + hover-reveal action buttons for dept / subdept / category nodes.
// Root element does NOT stop propagation so Collapse headers still toggle correctly.
// Only the action buttons stop propagation.

interface NodeTitleProps {
  nodeId: number;
  nodeType: 'dept' | 'subdept' | 'category';
  parentId?: number;
  label: string;
  displayOrder: number;
  siblingCount: number;
  isActive?: boolean;
  onSaved: () => void;
}

const NodeTitle: React.FC<NodeTitleProps> = ({
  nodeId, nodeType, parentId, label, displayOrder, siblingCount, isActive = true, onSaved,
}) => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(label);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    qc.invalidateQueries({ queryKey: ['hierarchy-stats'] });
    onSaved();
  };

  const saveName = async () => {
    if (!editVal.trim() || editVal.trim() === label) { setEditing(false); return; }
    try {
      if (nodeType === 'dept') await updateDepartment(nodeId, { name: editVal.trim() });
      else if (nodeType === 'subdept') await updateSubDepartment(nodeId, { name: editVal.trim() });
      else await updateCategory(nodeId, { name: editVal.trim() });
      message.success('Renamed');
      invalidate();
    } catch { message.error('Save failed'); }
    setEditing(false);
  };

  const handleDelete = async () => {
    try {
      if (nodeType === 'dept') await deleteDepartment(nodeId);
      else if (nodeType === 'subdept') await deleteSubDepartment(nodeId);
      else await deleteCategory(nodeId);
      message.success('Deleted');
      invalidate();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Delete failed — may have active children');
    }
  };

  const moveOrder = async (direction: 'up' | 'down') => {
    const newOrder = direction === 'up' ? displayOrder - 1 : displayOrder + 1;
    try {
      if (nodeType === 'dept') await updateDepartment(nodeId, { displayOrder: newOrder });
      else if (nodeType === 'subdept') await updateSubDepartment(nodeId, { displayOrder: newOrder });
      else await updateCategory(nodeId, { displayOrder: newOrder });
      invalidate();
    } catch { message.error('Reorder failed'); }
  };

  const iconMap = {
    dept: <FolderOutlined style={{ color: '#fa8c16' }} />,
    subdept: <AppstoreOutlined style={{ color: '#1890ff' }} />,
    category: <TagOutlined style={{ color: '#52c41a' }} />,
  };

  if (editing) {
    return (
      <Space size={4} onClick={e => e.stopPropagation()}>
        {iconMap[nodeType]}
        <Input
          size="small"
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onPressEnter={saveName}
          autoFocus
          style={{ width: 150 }}
        />
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={saveName} />
        <Button size="small" icon={<CloseOutlined />} onClick={() => { setEditing(false); setEditVal(label); }} />
      </Space>
    );
  }

  return (
    <span className="hierarchy-node-row" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {iconMap[nodeType]}
      <span style={{ opacity: isActive ? 1 : 0.45, fontSize: nodeType === 'category' ? 12 : 13 }}>{label}</span>
      {!isActive && <Tag color="default" style={{ fontSize: 10 }}>inactive</Tag>}
      <span className="node-actions" onClick={e => e.stopPropagation()}>
        <Space size={0}>
          {displayOrder > 1 && (
            <Tooltip title="Move up">
              <Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={() => moveOrder('up')} />
            </Tooltip>
          )}
          {displayOrder < siblingCount && (
            <Tooltip title="Move down">
              <Button size="small" type="text" icon={<ArrowDownOutlined />} onClick={() => moveOrder('down')} />
            </Tooltip>
          )}
          <Tooltip title="Rename">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(true)} />
          </Tooltip>
          <Popconfirm
            title={`Delete this ${nodeType}?`}
            description="This may fail if it has active children or linked articles."
            onConfirm={handleDelete}
            okText="Delete" okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      </span>
    </span>
  );
};

// ─── AddNode ──────────────────────────────────────────────────────────────────

interface AddNodeProps {
  nodeType: 'dept' | 'subdept' | 'category';
  parentId?: number;
  onSaved: () => void;
  placeholder: string;
}

const AddNode: React.FC<AddNodeProps> = ({ nodeType, parentId, onSaved, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const save = async () => {
    if (!val.trim()) return;
    setLoading(true);
    try {
      const code = val.trim().toUpperCase().replace(/\s+/g, '_');
      if (nodeType === 'dept') {
        await createDepartment({ code, name: val.trim(), displayOrder: 99 });
      } else if (nodeType === 'subdept') {
        await createSubDepartment({ departmentId: parentId!, code, name: val.trim(), displayOrder: 99 });
      } else {
        await createCategory({ subDepartmentId: parentId!, code, name: val.trim(), displayOrder: 99 });
      }
      message.success('Added');
      qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
      qc.invalidateQueries({ queryKey: ['hierarchy-stats'] });
      onSaved();
      setVal('');
      setOpen(false);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Create failed');
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <Button
        size="small" type="dashed" icon={<PlusOutlined />}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ width: '100%', marginTop: 4 }}
      >
        {placeholder}
      </Button>
    );
  }

  return (
    <Space size={4} onClick={e => e.stopPropagation()} style={{ width: '100%', marginTop: 4 }}>
      <Input
        size="small" placeholder="Name…" value={val}
        onChange={e => setVal(e.target.value)}
        onPressEnter={save}
        autoFocus
        style={{ flex: 1 }}
      />
      <Button size="small" type="primary" icon={<CheckOutlined />} loading={loading} onClick={save} />
      <Button size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
    </Space>
  );
};

// ─── AttributePanel (exported — used by CategoryAttributeMapper tab) ───────────

const GARMENT_TYPES = [
  { value: 'UPPER', label: 'Upper (tops, shirts, jackets)' },
  { value: 'LOWER', label: 'Lower (pants, skirts, bottoms)' },
  { value: 'ALL_IN_ONE', label: 'All-in-one (sets, dresses, coords)' },
];

export interface AttributePanelProps {
  category: SelectedCategory;
  onGarmentTypeChange?: (catId: number, type: string) => void;
}

export const AttributePanel: React.FC<AttributePanelProps> = ({ category, onGarmentTypeChange }) => {
  const qc = useQueryClient();
  const [localChanges, setLocalChanges] = useState<Record<number, Partial<AttrRow>>>({});
  const [saving, setSaving] = useState(false);

  const { data: catAttrs, isLoading } = useQuery({
    queryKey: ['category-all-attributes', category.id],
    queryFn: () => getCategoryWithAllAttributes(category.id),
    staleTime: 0,
  });

  const rows: AttrRow[] = useMemo(() => {
    if (!catAttrs?.allAttributes) return [];
    return (catAttrs.allAttributes as any[]).map((a: any) => ({
      attributeId: a.attributeId,
      attrKey: a.attributeKey,
      attrLabel: a.attributeLabel,
      attrType: a.attributeType,
      isEnabled: localChanges[a.attributeId]?.isEnabled ?? a.isEnabled ?? false,
      isRequired: localChanges[a.attributeId]?.isRequired ?? a.isRequired ?? false,
      displayOrder: a.displayOrder ?? 0,
    }));
  }, [catAttrs, localChanges]);

  const handleToggle = (attrId: number, field: 'isEnabled' | 'isRequired', value: boolean) => {
    setLocalChanges(prev => {
      const existing = prev[attrId] || {};
      const next = { ...existing, [field]: value };
      if (field === 'isEnabled' && !value) next.isRequired = false;
      return { ...prev, [attrId]: next };
    });
  };

  const enabledCount = rows.filter(r => r.isEnabled).length;
  const changedCount = Object.keys(localChanges).length;

  const saveAll = async () => {
    if (!changedCount) return;
    setSaving(true);
    const entries = Object.entries(localChanges);
    let ok = 0;
    for (const [attrIdStr, changes] of entries) {
      try {
        await updateCategoryAttributeMapping(category.id, parseInt(attrIdStr), changes);
        ok++;
      } catch { /* skip */ }
    }
    message.success(`Saved ${ok}/${entries.length} attribute changes`);
    setLocalChanges({});
    qc.invalidateQueries({ queryKey: ['category-all-attributes', category.id] });
    qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    setSaving(false);
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
      title: 'Attribute',
      key: 'attr',
      render: (_: any, r: AttrRow) => (
        <Space>
          <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.attrKey}</Tag>
          <span>{r.attrLabel}</span>
        </Space>
      ),
    },
    {
      title: () => (
        <Space>
          <span>Enabled</span>
          <Badge count={enabledCount} style={{ backgroundColor: '#52c41a' }} />
        </Space>
      ),
      key: 'isEnabled',
      width: 90,
      render: (_: any, r: AttrRow) => (
        <Switch size="small" checked={r.isEnabled} onChange={v => handleToggle(r.attributeId, 'isEnabled', v)} />
      ),
    },
    {
      title: 'Required',
      key: 'isRequired',
      width: 90,
      render: (_: any, r: AttrRow) => (
        <Switch size="small" checked={r.isRequired} disabled={!r.isEnabled} onChange={v => handleToggle(r.attributeId, 'isRequired', v)} />
      ),
    },
  ];

  return (
    <div>
      <div style={{ padding: '0 0 12px', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
        <Space wrap>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Category</Text>
            <div>
              <Text strong style={{ fontSize: 16 }}>{category.name}</Text>{' '}
              <Tag>{category.code}</Tag>
            </div>
            <Text type="secondary">{category.departmentName}</Text>
          </div>
          {onGarmentTypeChange && (
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Garment Type</Text>
              <Select
                value={category.garmentType}
                options={GARMENT_TYPES}
                onChange={v => onGarmentTypeChange(category.id, v)}
                style={{ width: 260 }}
                size="small"
              />
            </div>
          )}
        </Space>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <Button size="small" onClick={() => toggleAll(true)}>Enable All</Button>
          <Button size="small" onClick={() => toggleAll(false)}>Disable All</Button>
          {changedCount > 0 && <Tag color="orange">{changedCount} unsaved changes</Tag>}
        </Space>
        <Button
          type="primary" icon={<SaveOutlined />} size="small"
          loading={saving} disabled={!changedCount}
          onClick={saveAll}
        >
          Save Changes
        </Button>
      </div>

      <Spin spinning={isLoading}>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="attributeId"
          size="small"
          pagination={{ pageSize: 25, showSizeChanger: false }}
          scroll={{ y: 460 }}
          rowClassName={r => localChanges[r.attributeId] ? 'attr-row-changed' : ''}
        />
      </Spin>
      <style>{`.attr-row-changed { background: #fffbe6 !important; }`}</style>
    </div>
  );
};

// ─── DeptCard ─────────────────────────────────────────────────────────────────

const DeptCard: React.FC<{ dept: any; index: number; total: number; refetch: () => void }> = ({
  dept, index, total, refetch,
}) => {
  const catCount = (dept.subDepartments ?? []).reduce(
    (acc: number, sub: any) => acc + (sub.categories ?? []).length, 0
  );

  const collapseItems = (dept.subDepartments ?? []).map((sub: any, si: number) => ({
    key: String(sub.id),
    label: (
      <span style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
        <NodeTitle
          nodeId={sub.id} nodeType="subdept" parentId={dept.id} label={sub.name}
          displayOrder={si + 1} siblingCount={(dept.subDepartments ?? []).length}
          onSaved={refetch}
        />
        <Badge
          count={(sub.categories ?? []).length}
          size="small"
          style={{ backgroundColor: '#bfbfbf', marginLeft: 'auto', flexShrink: 0 }}
        />
      </span>
    ),
    children: (
      <div>
        {(sub.categories ?? []).length === 0 && (
          <Text type="secondary" style={{ fontSize: 12, padding: '4px 0', display: 'block' }}>
            No categories yet
          </Text>
        )}
        {(sub.categories ?? []).map((cat: any, ci: number) => (
          <div key={cat.id} style={{ padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
            <NodeTitle
              nodeId={cat.id} nodeType="category" parentId={sub.id}
              label={`${cat.name} (${cat.code})`}
              displayOrder={ci + 1} siblingCount={(sub.categories ?? []).length}
              isActive={cat.isActive !== false}
              onSaved={refetch}
            />
          </div>
        ))}
        <div style={{ paddingTop: 6 }}>
          <AddNode nodeType="category" parentId={sub.id} onSaved={refetch} placeholder="Add category" />
        </div>
      </div>
    ),
  }));

  return (
    <Card
      title={
        <NodeTitle
          nodeId={dept.id} nodeType="dept" label={dept.name}
          displayOrder={index + 1} siblingCount={total}
          onSaved={refetch}
        />
      }
      extra={<Tag color="blue">{catCount} categories</Tag>}
      style={{ width: 340, minWidth: 300, flexShrink: 0 }}
      size="small"
      styles={{ header: { background: '#fffbe6', borderBottom: '1px solid #f0f0f0' } }}
    >
      {collapseItems.length === 0 ? (
        <Empty
          description="No sub-departments yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '8px 0' }}
        />
      ) : (
        <Collapse
          items={collapseItems}
          defaultActiveKey={collapseItems.map(i => i.key)}
          size="small"
          ghost
        />
      )}
      <Divider dashed style={{ margin: '8px 0' }} />
      <AddNode nodeType="subdept" parentId={dept.id} onSaved={refetch} placeholder="Add sub-department" />
    </Card>
  );
};

// ─── HierarchyTreeEditor ──────────────────────────────────────────────────────

export const HierarchyTreeEditor: React.FC = () => {
  const [searchText, setSearchText] = useState('');

  const { data: hierarchyData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['hierarchy-tree'],
    queryFn: getHierarchyTree,
    retry: 1,
  });

  const filteredDepts = useMemo((): any[] => {
    const all: any[] = Array.isArray(hierarchyData) ? hierarchyData : [];
    if (!searchText.trim()) return all;
    const lower = searchText.toLowerCase();
    return all.reduce((acc: any[], dept: any) => {
      const deptMatch = dept.name.toLowerCase().includes(lower);
      const filteredSubs = (dept.subDepartments ?? []).reduce((sAcc: any[], sub: any) => {
        const subMatch = sub.name.toLowerCase().includes(lower);
        const filteredCats = (sub.categories ?? []).filter((cat: any) =>
          cat.name.toLowerCase().includes(lower) || cat.code.toLowerCase().includes(lower)
        );
        if (deptMatch || subMatch || filteredCats.length > 0) {
          sAcc.push({ ...sub, categories: (deptMatch || subMatch) ? sub.categories : filteredCats });
        }
        return sAcc;
      }, []);
      if (deptMatch || filteredSubs.length > 0) {
        acc.push({ ...dept, subDepartments: deptMatch ? dept.subDepartments : filteredSubs });
      }
      return acc;
    }, []);
  }, [hierarchyData, searchText]);

  return (
    <div>
      <Input.Search
        placeholder="Search departments, sub-departments, categories or codes…"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        onSearch={setSearchText}
        allowClear
        style={{ marginBottom: 16, maxWidth: 420 }}
      />

      {isError && (
        <Alert
          type="error"
          message="Failed to load hierarchy"
          description={(error as any)?.message || 'Check that the backend is running and you are logged in as Admin.'}
          showIcon
          action={<Button size="small" onClick={() => refetch()}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={isLoading}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {filteredDepts.map((dept: any, i: number) => (
            <DeptCard key={dept.id} dept={dept} index={i} total={filteredDepts.length} refetch={refetch} />
          ))}

          {/* Add-department placeholder card */}
          {!searchText && !isError && (
            <div style={{
              width: 340, minWidth: 300, border: '2px dashed #d9d9d9', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 80, padding: 12,
            }}>
              <AddNode nodeType="dept" onSaved={refetch} placeholder="Add department" />
            </div>
          )}

          {filteredDepts.length === 0 && !isLoading && !isError && (
            <Empty
              description={searchText ? `No results for "${searchText}"` : 'No departments yet — add one'}
              style={{ margin: '40px auto' }}
            />
          )}
        </div>
      </Spin>

      <style>{`
        .hierarchy-node-row .node-actions { opacity: 0; transition: opacity 0.15s; }
        .hierarchy-node-row:hover .node-actions { opacity: 1; }
        .ant-collapse-header:hover .node-actions { opacity: 1; }
        .ant-card-head:hover .node-actions { opacity: 1; }
      `}</style>
    </div>
  );
};
