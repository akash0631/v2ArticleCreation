/**
 * Hierarchy Tree Component
 * Displays the complete fashion hierarchy tree
 */
import { useMemo } from 'react';
import { Folder, FolderOpen, Tag as TagIcon } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  Skeleton,
  Tree,
  type TreeNode,
} from '@/shared/components/ui-tw';
import type { Department } from '../../../services/adminApi';

interface HierarchyTreeProps {
  hierarchy?: Department[];
  loading: boolean;
}

export const HierarchyTree = ({ hierarchy, loading }: HierarchyTreeProps) => {
  const treeData: TreeNode[] = useMemo(() => {
    if (!hierarchy) return [];
    return hierarchy.map((dept) => ({
      key: `dept-${dept.id}`,
      icon: <Folder className="h-4 w-4 text-primary" />,
      title: (
        <span className="flex items-center gap-2">
          <strong>{dept.name}</strong>
          {dept.subDepartments && dept.subDepartments.length > 0 && (
            <Badge variant="info">{dept.subDepartments.length} sub-depts</Badge>
          )}
        </span>
      ),
      children: dept.subDepartments?.map((subDept) => ({
        key: `subdept-${subDept.id}`,
        icon: <FolderOpen className="h-4 w-4 text-purple-500" />,
        title: (
          <span className="flex items-center gap-2">
            <span>{subDept.name}</span>
            {subDept.categories && subDept.categories.length > 0 && (
              <Badge variant="success">{subDept.categories.length} categories</Badge>
            )}
          </span>
        ),
        children: subDept.categories?.map((cat) => ({
          key: `cat-${cat.id}`,
          icon: <TagIcon className="h-4 w-4 text-emerald-500" />,
          title: cat.name,
          isLeaf: true,
        })),
      })),
    }));
  }, [hierarchy]);

  const header = (
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Folder className="h-4 w-4" />
        <span>Complete Hierarchy</span>
      </CardTitle>
      {!loading && hierarchy && hierarchy.length > 0 && (
        <Badge variant="info">{treeData.length} Departments</Badge>
      )}
    </CardHeader>
  );

  if (loading) {
    return (
      <Card>
        {header}
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!hierarchy || hierarchy.length === 0) {
    return (
      <Card>
        {header}
        <CardContent>
          <Empty description="No hierarchy data available" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardContent>
        <div className="max-h-[500px] overflow-auto rounded-md bg-muted/30 p-4">
          <Tree treeData={treeData} blockNode showIcon />
        </div>
      </CardContent>
    </Card>
  );
};
