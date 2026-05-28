/**
 * HierarchyTreeEditor
 * Department cards layout. Clicking a category fires onCategorySelect
 * so the parent can navigate to the Attribute Mapping tab.
 */

import { useState, useMemo } from 'react';
import {
  Card, Button, Input, Space, message, Spin,
  Tag, Tooltip, Typography, Badge, Collapse, Empty, Alert, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined,
  CheckOutlined, CloseOutlined, FolderOutlined,
  TagOutlined, AppstoreOutlined, RightOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getHierarchyTree,
  createDepartment, updateDepartment,
  createSubDepartment, updateSubDepartment,
  createCategory, updateCategory,
} from '../../../services/adminApi';

const { Text } = Typography;

export interface SelectedCategory {
  id: number;
  name: string;
  code: string;
  garmentType: string;
  departmentName: string;
}

// ─── NodeTitle ────────────────────────────────────────────────────────────────

interface NodeTitleProps {
  nodeId: number;
  nodeType: 'dept' | 'subdept' | 'category';
  parentId?: number;
  label: string;
  isActive?: boolean;
  onSaved: () => void;
}

const NodeTitle: React.FC<NodeTitleProps> = ({
  nodeId, nodeType, parentId, label, isActive = true, onSaved,
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


  const iconMap = {
    dept: <FolderOutlined style={{ color: '#fa8c16', flexShrink: 0 }} />,
    subdept: <AppstoreOutlined style={{ color: '#1890ff', flexShrink: 0 }} />,
    category: <TagOutlined style={{ color: '#52c41a', flexShrink: 0 }} />,
  };

  if (editing) {
    return (
      <Space size={4} onClick={e => e.stopPropagation()}>
        {iconMap[nodeType]}
        <Input
          size="small" value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onPressEnter={saveName} autoFocus style={{ width: 150 }}
        />
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={saveName} />
        <Button size="small" icon={<CloseOutlined />} onClick={() => { setEditing(false); setEditVal(label); }} />
      </Space>
    );
  }

  return (
    <span className="hierarchy-node-row" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {iconMap[nodeType]}
      <span style={{ opacity: isActive ? 1 : 0.45, fontSize: nodeType === 'category' ? 12 : 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {!isActive && <Tag color="default" style={{ fontSize: 10, flexShrink: 0 }}>inactive</Tag>}
      <span className="node-actions" onClick={e => e.stopPropagation()}>
        <Space size={0}>
          <Tooltip title="Rename">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(true)} />
          </Tooltip>
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
      setVal(''); setOpen(false);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Create failed');
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <Button size="small" type="dashed" icon={<PlusOutlined />}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ width: '100%', marginTop: 4 }}>
        {placeholder}
      </Button>
    );
  }

  return (
    <Space size={4} onClick={e => e.stopPropagation()} style={{ width: '100%', marginTop: 4 }}>
      <Input size="small" placeholder="Name…" value={val} onChange={e => setVal(e.target.value)} onPressEnter={save} autoFocus style={{ flex: 1 }} />
      <Button size="small" type="primary" icon={<CheckOutlined />} loading={loading} onClick={save} />
      <Button size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
    </Space>
  );
};

// ─── DeptCard ─────────────────────────────────────────────────────────────────

interface DeptCardProps {
  dept: any;
  index: number;
  total: number;
  refetch: () => void;
  onCategorySelect?: (cat: SelectedCategory) => void;
}

const DeptCard: React.FC<DeptCardProps> = ({ dept, index, total, refetch, onCategorySelect }) => {
  const catCount = (dept.subDepartments ?? []).reduce(
    (acc: number, sub: any) => acc + (sub.categories ?? []).length, 0
  );

  const collapseItems = (dept.subDepartments ?? []).map((sub: any, si: number) => ({
    key: String(sub.id),
    label: (
      <span style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
        <NodeTitle nodeId={sub.id} nodeType="subdept" parentId={dept.id} label={sub.name} onSaved={refetch} />
        <Badge count={(sub.categories ?? []).length} size="small" style={{ backgroundColor: '#bfbfbf', marginLeft: 'auto', flexShrink: 0 }} />
      </span>
    ),
    children: (
      <div>
        {(sub.categories ?? []).length === 0 && (
          <Text type="secondary" style={{ fontSize: 12, padding: '4px 0', display: 'block' }}>No categories yet</Text>
        )}
        {(sub.categories ?? []).map((cat: any) => {
          const enabledCount = (cat.attributes ?? []).filter((a: any) => a.isEnabled).length;
          const totalAttrs = (cat.attributes ?? []).length;
          return (
            <div
              key={cat.id}
              className="cat-row"
              style={{ padding: '5px 8px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', borderRadius: 4 }}
              onClick={() => onCategorySelect?.({ id: cat.id, name: cat.name, code: cat.code, garmentType: cat.garmentType ?? 'UPPER', departmentName: dept.name })}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <NodeTitle nodeId={cat.id} nodeType="category" parentId={sub.id} label={`${cat.name} (${cat.code})`} isActive={cat.isActive !== false} onSaved={refetch} />
              </div>
              {onCategorySelect && (
                <Tooltip title="Manage attributes">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, flexShrink: 0 }}>
                    {totalAttrs > 0 && (
                      <Tag color={enabledCount > 0 ? 'green' : 'default'} style={{ fontSize: 10, margin: 0 }}>
                        {enabledCount}/{totalAttrs}
                      </Tag>
                    )}
                    <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} className="cat-arrow" />
                  </span>
                </Tooltip>
              )}
            </div>
          );
        })}
        <div style={{ paddingTop: 6 }}>
          <AddNode nodeType="category" parentId={sub.id} onSaved={refetch} placeholder="Add category" />
        </div>
      </div>
    ),
  }));

  return (
    <Card
      title={<NodeTitle nodeId={dept.id} nodeType="dept" label={dept.name} onSaved={refetch} />}
      extra={<Tag color="blue">{catCount} categories</Tag>}
      style={{ width: 340, minWidth: 300, flexShrink: 0 }}
      size="small"
      styles={{ header: { background: '#fffbe6', borderBottom: '1px solid #f0f0f0' } }}
    >
      {collapseItems.length === 0 ? (
        <Empty description="No sub-departments yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '8px 0' }} />
      ) : (
        <Collapse items={collapseItems} defaultActiveKey={collapseItems.map(i => i.key)} size="small" ghost />
      )}
      <Divider dashed style={{ margin: '8px 0' }} />
      <AddNode nodeType="subdept" parentId={dept.id} onSaved={refetch} placeholder="Add sub-department" />
    </Card>
  );
};

// ─── HierarchyTreeEditor ──────────────────────────────────────────────────────

interface HierarchyTreeEditorProps {
  onCategorySelect?: (cat: SelectedCategory) => void;
}

export const HierarchyTreeEditor: React.FC<HierarchyTreeEditorProps> = ({ onCategorySelect }) => {
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
            <DeptCard
              key={dept.id} dept={dept} index={i} total={filteredDepts.length}
              refetch={refetch} onCategorySelect={onCategorySelect}
            />
          ))}

          {!searchText && !isError && (
            <div style={{ width: 340, minWidth: 300, border: '2px dashed #d9d9d9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, padding: 12 }}>
              <AddNode nodeType="dept" onSaved={refetch} placeholder="Add department" />
            </div>
          )}

          {filteredDepts.length === 0 && !isLoading && !isError && (
            <Empty description={searchText ? `No results for "${searchText}"` : 'No departments yet'} style={{ margin: '40px auto' }} />
          )}
        </div>
      </Spin>

      <style>{`
        .hierarchy-node-row .node-actions { opacity: 0; transition: opacity 0.15s; }
        .hierarchy-node-row:hover .node-actions { opacity: 1; }
        .ant-collapse-header:hover .node-actions { opacity: 1; }
        .ant-card-head:hover .node-actions { opacity: 1; }
        .cat-row { cursor: pointer; transition: background 0.15s; }
        .cat-row:hover { background: #f0f7ff; }
        .cat-row:hover .cat-arrow { color: #1890ff !important; }
      `}</style>
    </div>
  );
};
