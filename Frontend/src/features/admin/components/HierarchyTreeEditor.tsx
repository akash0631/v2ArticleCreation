/**
 * HierarchyTreeEditor
 * Left panel: collapsible tree (dept → sub-dept → category) with inline add/edit/delete
 * Right panel: attribute assignment for selected category
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Tree, Button, Input, Space, Popconfirm, message, Spin, Table,
  Switch, Tag, Empty, Select, Divider, Badge, Tooltip, Typography, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, CloseOutlined, FolderOutlined,
  TagOutlined, AppstoreOutlined, SaveOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DataNode } from 'antd/es/tree';
import {
  getHierarchyTree, getMasterAttributes, getCategoryWithAllAttributes,
  updateCategoryAttributeMapping,
  createDepartment, updateDepartment, deleteDepartment,
  createSubDepartment, updateSubDepartment, deleteSubDepartment,
  createCategory, updateCategory, deleteCategory,
} from '../../../services/adminApi';

const { Text } = Typography;

// ─── Types ───────────────────────────────────────────────────────────────────

interface HierarchyNode extends DataNode {
  nodeType: 'dept' | 'subdept' | 'category';
  nodeId: number;
  parentId?: number;
  displayOrder: number;
  isActive?: boolean;
}

interface SelectedCategory {
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

// ─── Node Title ──────────────────────────────────────────────────────────────

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

  const iconMap = { dept: <FolderOutlined style={{ color: '#fa8c16' }} />, subdept: <AppstoreOutlined style={{ color: '#1890ff' }} />, category: <TagOutlined style={{ color: '#52c41a' }} /> };

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
          style={{ width: 160 }}
        />
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={saveName} />
        <Button size="small" icon={<CloseOutlined />} onClick={() => { setEditing(false); setEditVal(label); }} />
      </Space>
    );
  }

  return (
    <Space size={6} className="hierarchy-tree-node" onClick={e => e.stopPropagation()}>
      {iconMap[nodeType]}
      <span style={{ opacity: isActive ? 1 : 0.45 }}>{label}</span>
      {!isActive && <Tag color="default" style={{ fontSize: 10 }}>inactive</Tag>}
      <Space size={2} className="node-actions">
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
    </Space>
  );
};

// ─── Add Node Row ─────────────────────────────────────────────────────────────

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
      message.success(`${nodeType === 'dept' ? 'Department' : nodeType === 'subdept' ? 'Sub-department' : 'Category'} added`);
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
        style={{ marginLeft: nodeType === 'dept' ? 0 : nodeType === 'subdept' ? 24 : 48, marginTop: 4 }}
      >
        {placeholder}
      </Button>
    );
  }

  return (
    <Space size={4} onClick={e => e.stopPropagation()} style={{ marginLeft: nodeType === 'dept' ? 0 : nodeType === 'subdept' ? 24 : 48 }}>
      <Input
        size="small"
        placeholder="Name..."
        value={val}
        onChange={e => setVal(e.target.value)}
        onPressEnter={save}
        autoFocus
        style={{ width: 180 }}
      />
      <Button size="small" type="primary" icon={<CheckOutlined />} loading={loading} onClick={save} />
      <Button size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
    </Space>
  );
};

// ─── Attribute Panel ──────────────────────────────────────────────────────────

const GARMENT_TYPES = [
  { value: 'UPPER', label: 'Upper (tops, shirts, jackets)' },
  { value: 'LOWER', label: 'Lower (pants, skirts, bottoms)' },
  { value: 'ALL_IN_ONE', label: 'All-in-one (sets, dresses, coords)' },
];

interface AttributePanelProps {
  category: SelectedCategory;
  onGarmentTypeChange: (catId: number, type: string) => void;
}

const AttributePanel: React.FC<AttributePanelProps> = ({ category, onGarmentTypeChange }) => {
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
      const attrId = parseInt(attrIdStr);
      try {
        await updateCategoryAttributeMapping(category.id, attrId, changes);
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
      title: () => <Space><span>Enabled</span><Badge count={enabledCount} style={{ backgroundColor: '#52c41a' }} /></Space>,
      key: 'isEnabled',
      width: 90,
      render: (_: any, r: AttrRow) => (
        <Switch
          size="small"
          checked={r.isEnabled}
          onChange={v => handleToggle(r.attributeId, 'isEnabled', v)}
        />
      ),
    },
    {
      title: 'Required',
      key: 'isRequired',
      width: 90,
      render: (_: any, r: AttrRow) => (
        <Switch
          size="small"
          checked={r.isRequired}
          disabled={!r.isEnabled}
          onChange={v => handleToggle(r.attributeId, 'isRequired', v)}
        />
      ),
    },
  ];

  return (
    <div>
      {/* Category header */}
      <div style={{ padding: '16px 0 12px', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
        <Space wrap>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Category</Text>
            <div><Text strong style={{ fontSize: 16 }}>{category.name}</Text> <Tag>{category.code}</Tag></div>
            <Text type="secondary">{category.departmentName}</Text>
          </div>
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
        </Space>
      </div>

      {/* Action bar */}
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
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ y: 420 }}
          rowClassName={r => localChanges[r.attributeId] ? 'attr-row-changed' : ''}
        />
      </Spin>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const HierarchyTreeEditor: React.FC = () => {
  const qc = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');

  const { data: hierarchyData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['hierarchy-tree'],
    queryFn: getHierarchyTree,
    retry: 1,
  });

  const changeGarmentType = useMutation({
    mutationFn: ({ catId, type }: { catId: number; type: string }) =>
      updateCategory(catId, { garmentType: type }),
    onSuccess: (_, { type }) => {
      message.success('Garment type updated');
      if (selectedCategory) setSelectedCategory(prev => prev ? { ...prev, garmentType: type } : prev);
      qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    },
    onError: () => message.error('Update failed'),
  });

  // Filter raw hierarchy by search text before building tree nodes
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

  // Auto-expand: dept level on first load; all matching levels when searching
  useEffect(() => {
    if (!Array.isArray(filteredDepts) || filteredDepts.length === 0) return;
    if (searchText.trim()) {
      // Expand everything that matched
      const keys: React.Key[] = [];
      filteredDepts.forEach((d: any) => {
        keys.push(`dept-${d.id}`);
        (d.subDepartments ?? []).forEach((s: any) => keys.push(`sub-${s.id}`));
      });
      setExpandedKeys(keys);
    } else if (expandedKeys.length === 0) {
      // First load: expand department level only
      setExpandedKeys(filteredDepts.map((d: any) => `dept-${d.id}`));
    }
  }, [filteredDepts, searchText]);

  // Build Ant Design tree nodes
  const treeData: HierarchyNode[] = useMemo(() => {
    const depts: any[] = filteredDepts;
    return depts.map((dept, di) => ({
      key: `dept-${dept.id}`,
      nodeType: 'dept' as const,
      nodeId: dept.id,
      displayOrder: dept.displayOrder ?? di + 1,
      siblingCount: depts.length,
      isActive: dept.isActive !== false,
      title: (
        <NodeTitle
          nodeId={dept.id} nodeType="dept" label={dept.name}
          displayOrder={dept.displayOrder ?? di + 1} siblingCount={depts.length}
          onSaved={() => refetch()}
        />
      ),
      children: [
        ...(dept.subDepartments ?? []).map((sub: any, si: number) => ({
          key: `sub-${sub.id}`,
          nodeType: 'subdept' as const,
          nodeId: sub.id,
          parentId: dept.id,
          displayOrder: sub.displayOrder ?? si + 1,
          siblingCount: (dept.subDepartments ?? []).length,
          isActive: sub.isActive !== false,
          title: (
            <NodeTitle
              nodeId={sub.id} nodeType="subdept" parentId={dept.id} label={sub.name}
              displayOrder={sub.displayOrder ?? si + 1}
              siblingCount={(dept.subDepartments ?? []).length}
              onSaved={() => refetch()}
            />
          ),
          children: [
            ...(sub.categories ?? []).map((cat: any, ci: number) => ({
              key: `cat-${cat.id}`,
              nodeType: 'category' as const,
              nodeId: cat.id,
              parentId: sub.id,
              displayOrder: cat.displayOrder ?? ci + 1,
              siblingCount: (sub.categories ?? []).length,
              isActive: cat.isActive !== false,
              isLeaf: true,
              title: (
                <NodeTitle
                  nodeId={cat.id} nodeType="category" parentId={sub.id} label={`${cat.name} (${cat.code})`}
                  displayOrder={cat.displayOrder ?? ci + 1}
                  siblingCount={(sub.categories ?? []).length}
                  isActive={cat.isActive !== false}
                  onSaved={() => refetch()}
                />
              ),
              // store for right panel
              _cat: cat,
              _dept: dept,
            })),
            // Add category button (hidden while searching)
            ...(!searchText ? [{
              key: `add-cat-${sub.id}`,
              nodeType: 'category' as const,
              nodeId: -1,
              parentId: sub.id,
              displayOrder: 999,
              isLeaf: true,
              title: <AddNode nodeType="category" parentId={sub.id} onSaved={() => refetch()} placeholder="Add category" />,
              selectable: false,
            }] : []),
          ],
        })),
        // Add sub-dept button (hidden while searching)
        ...(!searchText ? [{
          key: `add-sub-${dept.id}`,
          nodeType: 'subdept' as const,
          nodeId: -1,
          parentId: dept.id,
          displayOrder: 999,
          isLeaf: true,
          title: <AddNode nodeType="subdept" parentId={dept.id} onSaved={() => refetch()} placeholder="Add sub-department" />,
          selectable: false,
        }] : []),
      ],
    }));
  }, [filteredDepts, searchText, refetch]);

  const handleSelect = (_keys: React.Key[], info: any) => {
    const node = info.node;
    if (node.nodeType !== 'category' || node.nodeId < 0) return;
    const cat = node._cat;
    const dept = node._dept;
    if (!cat) return;
    setSelectedCategory({
      id: cat.id,
      name: cat.name,
      code: cat.code,
      garmentType: cat.garmentType ?? 'UPPER',
      departmentName: dept?.name ?? '',
    });
  };

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: Tree */}
      <div style={{
        width: 420, minWidth: 320, flexShrink: 0,
        background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', padding: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>Hierarchy Tree</Text>
          <Space size={4}>
            <Button size="small" onClick={() => setExpandedKeys(treeData.flatMap(d => [d.key, ...(d.children ?? []).map((s: any) => s.key)]))}>
              Expand All
            </Button>
            <Button size="small" onClick={() => setExpandedKeys([])}>Collapse</Button>
          </Space>
        </div>
        <Input.Search
          placeholder="Search departments, sub-depts, categories…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          onSearch={v => setSearchText(v)}
          allowClear
          size="small"
          style={{ marginBottom: 12 }}
        />

        {isError && (
          <Alert
            type="error"
            style={{ marginBottom: 12 }}
            message="Failed to load hierarchy"
            description={(error as any)?.message || 'Check that the backend is running and you are logged in as Admin.'}
            showIcon
            action={<Button size="small" onClick={() => refetch()}>Retry</Button>}
          />
        )}
        <Spin spinning={isLoading}>
          {searchText && filteredDepts.length > 0 && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Showing {filteredDepts.length} dept{filteredDepts.length !== 1 ? 's' : ''} matching "{searchText}"
            </Text>
          )}
          {!isError && !isLoading && treeData.length === 0 && !searchText && (
            <Empty description="No departments yet — add one below" style={{ margin: '20px 0' }} />
          )}
          {!isError && !isLoading && treeData.length === 0 && searchText && (
            <Empty description={`No results for "${searchText}"`} style={{ margin: '20px 0' }} />
          )}
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            onSelect={handleSelect}
            showLine={{ showLeafIcon: false }}
            blockNode
            style={{ background: 'transparent' }}
          />
          {!searchText && (
            <>
              <Divider dashed style={{ margin: '12px 0' }} />
              <AddNode nodeType="dept" onSaved={() => refetch()} placeholder="Add department" />
            </>
          )}
        </Spin>
      </div>

      {/* Right: Attribute panel */}
      <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 16 }}>
        {selectedCategory ? (
          <AttributePanel
            key={selectedCategory.id}
            category={selectedCategory}
            onGarmentTypeChange={(catId, type) => changeGarmentType.mutate({ catId, type })}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
            description={
              <div style={{ textAlign: 'left', maxWidth: 360, margin: '0 auto' }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  Attribute Mapping
                </Text>
                <Text type="secondary">
                  Click any <Tag color="green" style={{ margin: '0 2px' }}>category</Tag> (green leaf node)
                  in the tree to see and edit its attribute mappings here.
                </Text>
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                  <Text style={{ fontSize: 12 }}>
                    Each category has up to 45 master attributes. Toggle <strong>Enabled</strong> to include
                    an attribute in extraction, and <strong>Required</strong> to mark it as mandatory.
                    Changes here affect what creators see when extracting articles.
                  </Text>
                </div>
              </div>
            }
          />
        )}
      </div>

      <style>{`
        .hierarchy-tree-node .node-actions { opacity: 0; transition: opacity 0.15s; }
        .hierarchy-tree-node:hover .node-actions { opacity: 1; }
        .ant-tree-node-content-wrapper:hover .hierarchy-tree-node .node-actions { opacity: 1; }
        .attr-row-changed { background: #fffbe6 !important; }
      `}</style>
    </div>
  );
};
