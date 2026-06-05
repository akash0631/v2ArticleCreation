import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TreeNode {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  children?: TreeNode[];
}

interface TreeProps {
  treeData: TreeNode[];
  defaultExpandAll?: boolean;
  expandedKeys?: string[];
  onExpand?: (keys: string[]) => void;
  onSelect?: (keys: string[], info: { node: TreeNode }) => void;
  selectedKeys?: string[];
  showIcon?: boolean;
  blockNode?: boolean;
  className?: string;
}

const collectAllKeys = (nodes: TreeNode[]): string[] => {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    out.push(n.key);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
};

export const Tree: React.FC<TreeProps> = ({
  treeData,
  defaultExpandAll = false,
  expandedKeys: controlledExpanded,
  onExpand,
  onSelect,
  selectedKeys = [],
  showIcon = true,
  blockNode = false,
  className,
}) => {
  const [internalExpanded, setInternalExpanded] = React.useState<string[]>(() =>
    defaultExpandAll ? collectAllKeys(treeData) : [],
  );
  const expanded = controlledExpanded ?? internalExpanded;

  const toggle = (key: string) => {
    const next = expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key];
    if (controlledExpanded === undefined) setInternalExpanded(next);
    onExpand?.(next);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expanded.includes(node.key);
    const isSelected = selectedKeys.includes(node.key);
    const hasChildren = !node.isLeaf && (node.children?.length ?? 0) > 0;
    return (
      <li key={node.key}>
        <div
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm transition-colors hover:bg-accent',
            isSelected && 'bg-accent',
            blockNode && 'w-full',
          )}
          style={{ paddingLeft: depth * 16 + 4 }}
          onClick={() => {
            if (hasChildren) toggle(node.key);
            onSelect?.([node.key], { node });
          }}
        >
          {hasChildren ? (
            <ChevronRight
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isExpanded && 'rotate-90')}
            />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {showIcon && node.icon}
          <span className="flex-1">{node.title}</span>
        </div>
        {hasChildren && isExpanded && (
          <ul>{node.children!.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return <ul className={cn('list-none', className)}>{treeData.map((n) => renderNode(n, 0))}</ul>;
};
