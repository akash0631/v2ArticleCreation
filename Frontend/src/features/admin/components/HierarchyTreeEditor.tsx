/**
 * HierarchyTreeEditor
 * Department cards layout. Clicking a category fires onCategorySelect
 * so the parent can navigate to the Attribute Mapping tab.
 */
import { useState, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Check,
  X,
  Folder,
  Tag as TagIcon,
  LayoutGrid,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  Input,
  Separator,
  Spinner,
  Tag,
  Tooltip,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import {
  getHierarchyTree,
  createDepartment,
  updateDepartment,
  createSubDepartment,
  updateSubDepartment,
  createCategory,
  updateCategory,
} from '../../../services/adminApi';

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
  label: string;
  isActive?: boolean;
  onSaved: () => void;
}

const NodeTitle: React.FC<NodeTitleProps> = ({ nodeId, nodeType, label, isActive = true, onSaved }) => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(label);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hierarchy-tree'] });
    qc.invalidateQueries({ queryKey: ['hierarchy-stats'] });
    onSaved();
  };

  const saveName = async () => {
    if (!editVal.trim() || editVal.trim() === label) {
      setEditing(false);
      return;
    }
    try {
      if (nodeType === 'dept') await updateDepartment(nodeId, { name: editVal.trim() });
      else if (nodeType === 'subdept') await updateSubDepartment(nodeId, { name: editVal.trim() });
      else await updateCategory(nodeId, { name: editVal.trim() });
      message.success('Renamed');
      invalidate();
    } catch {
      message.error('Save failed');
    }
    setEditing(false);
  };


  const iconMap = {
    dept: <Folder className="h-4 w-4 shrink-0 text-amber-500" />,
    subdept: <LayoutGrid className="h-4 w-4 shrink-0 text-sky-500" />,
    category: <TagIcon className="h-4 w-4 shrink-0 text-emerald-500" />,
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {iconMap[nodeType]}
        <Input
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveName()}
          autoFocus
          className="h-7 w-[150px] text-xs"
        />
        <Button size="sm" onClick={saveName}>
          <Check />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(false);
            setEditVal(label);
          }}
        >
          <X />
        </Button>
      </span>
    );
  }

  return (
    <span className="hierarchy-node-row inline-flex min-w-0 items-center gap-1.5">
      {iconMap[nodeType]}
      <span
        className="truncate"
        style={{
          opacity: isActive ? 1 : 0.45,
          fontSize: nodeType === 'category' ? 12 : 13,
        }}
      >
        {label}
      </span>
      {!isActive && (
        <Tag className="shrink-0 text-[10px]">inactive</Tag>
      )}
      <span className="node-actions inline-flex" onClick={(e) => e.stopPropagation()}>
        <Tooltip title="Rename">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </Tooltip>
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
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="mt-1 w-full border-dashed"
      >
        <Plus />
        {placeholder}
      </Button>
    );
  }

  return (
    <span className="mt-1 flex w-full items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Input
        placeholder="Name…"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        autoFocus
        className="h-7 flex-1 text-xs"
      />
      <Button size="sm" onClick={save} disabled={loading}>
        <Check />
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
        <X />
      </Button>
    </span>
  );
};

// ─── DeptCard ─────────────────────────────────────────────────────────────────

interface DeptCardProps {
  dept: any;
  refetch: () => void;
  onCategorySelect?: (cat: SelectedCategory) => void;
}

const DeptCard: React.FC<DeptCardProps> = ({ dept, refetch, onCategorySelect }) => {
  const catCount = (dept.subDepartments ?? []).reduce(
    (acc: number, sub: any) => acc + (sub.categories ?? []).length,
    0,
  );
  const subDepartments = dept.subDepartments ?? [];

  return (
    <Card className="w-[340px] min-w-[300px] shrink-0">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-amber-50 p-3">
        <NodeTitle nodeId={dept.id} nodeType="dept" label={dept.name} onSaved={refetch} />
        <Badge variant="info">{catCount} categories</Badge>
      </CardHeader>
      <CardContent className="p-3">
        {subDepartments.length === 0 ? (
          <Empty description="No sub-departments yet" className="py-2" />
        ) : (
          <Accordion
            type="multiple"
            defaultValue={subDepartments.map((s: any) => String(s.id))}
            className="space-y-1"
          >
            {subDepartments.map((sub: any) => {
              const cats = sub.categories ?? [];
              return (
                <AccordionItem key={sub.id} value={String(sub.id)} className="border-0">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <span className="flex w-full items-center gap-2">
                      <NodeTitle nodeId={sub.id} nodeType="subdept" label={sub.name} onSaved={refetch} />
                      <Badge variant="secondary" className="ml-auto shrink-0">
                        {cats.length}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {cats.length === 0 && (
                      <p className="block py-1 text-xs text-muted-foreground">No categories yet</p>
                    )}
                    {cats.map((cat: any) => {
                      const enabledCount = (cat.attributes ?? []).filter((a: any) => a.isEnabled).length;
                      const totalAttrs = (cat.attributes ?? []).length;
                      return (
                        <div
                          key={cat.id}
                          className="cat-row flex items-center rounded border-b border-border/50 px-2 py-1.5 transition-colors"
                          onClick={() =>
                            onCategorySelect?.({
                              id: cat.id,
                              name: cat.name,
                              code: cat.code,
                              garmentType: cat.garmentType ?? 'UPPER',
                              departmentName: dept.name,
                            })
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <NodeTitle
                              nodeId={cat.id}
                              nodeType="category"
                              label={`${cat.name} (${cat.code})`}
                              isActive={cat.isActive !== false}
                              onSaved={refetch}
                            />
                          </div>
                          {onCategorySelect && (
                            <Tooltip title="Manage attributes">
                              <span className="ml-2 flex shrink-0 items-center gap-1">
                                {totalAttrs > 0 && (
                                  <Badge
                                    variant={enabledCount > 0 ? 'success' : 'secondary'}
                                    className="m-0 text-[10px]"
                                  >
                                    {enabledCount}/{totalAttrs}
                                  </Badge>
                                )}
                                <ChevronRight className="cat-arrow h-3 w-3 text-muted-foreground" />
                              </span>
                            </Tooltip>
                          )}
                        </div>
                      );
                    })}
                    <div className="pt-1.5">
                      <AddNode nodeType="category" parentId={sub.id} onSaved={refetch} placeholder="Add category" />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
        <Separator className="my-2 border-dashed" />
        <AddNode nodeType="subdept" parentId={dept.id} onSaved={refetch} placeholder="Add sub-department" />
      </CardContent>
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
        const filteredCats = (sub.categories ?? []).filter(
          (cat: any) =>
            cat.name.toLowerCase().includes(lower) || cat.code.toLowerCase().includes(lower),
        );
        if (deptMatch || subMatch || filteredCats.length > 0) {
          sAcc.push({ ...sub, categories: deptMatch || subMatch ? sub.categories : filteredCats });
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
      <Input
        placeholder="Search departments, sub-departments, categories or codes…"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        onClear={() => setSearchText('')}
        className="mb-4 max-w-[420px]"
      />

      {isError && (
        <Alert
          type="error"
          showIcon
          message="Failed to load hierarchy"
          description={(error as any)?.message || 'Check that the backend is running and you are logged in as Admin.'}
          className="mb-4"
        >
          <Button size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </Alert>
      )}

      <Spinner spinning={isLoading}>
        <div className="flex flex-wrap items-start gap-4">
          {filteredDepts.map((dept: any) => (
            <DeptCard
              key={dept.id}
              dept={dept}
              refetch={refetch}
              onCategorySelect={onCategorySelect}
            />
          ))}

          {!searchText && !isError && (
            <div className="flex min-h-[80px] w-[340px] min-w-[300px] items-center justify-center rounded-lg border-2 border-dashed border-border p-3">
              <AddNode nodeType="dept" onSaved={refetch} placeholder="Add department" />
            </div>
          )}

          {filteredDepts.length === 0 && !isLoading && !isError && (
            <Empty
              description={searchText ? `No results for "${searchText}"` : 'No departments yet'}
              className="mx-auto my-10"
            />
          )}
        </div>
      </Spinner>

      <style>{`
        .hierarchy-node-row .node-actions { opacity: 0; transition: opacity 0.15s; }
        .hierarchy-node-row:hover .node-actions { opacity: 1; }
        .cat-row { cursor: pointer; }
        .cat-row:hover { background: #f0f7ff; }
        .cat-row:hover .cat-arrow { color: #1890ff; }
      `}</style>
    </div>
  );
};
