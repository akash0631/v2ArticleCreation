import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Settings,
  Home,
  CheckSquare,
  FileText,
  History,
  XCircle,
  CheckCircle2,
  FileType2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed?: boolean;
  userRole?: string;
}

interface SidebarItem {
  key: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  to?: string;
  children?: SidebarItem[];
}

export default function Sidebar({ collapsed = false, userRole }: SidebarProps) {
  const location = useLocation();
  const selectedKey = location.pathname;

  const items: SidebarItem[] = [
    { key: '/', Icon: Home, label: 'Home', to: '/' },
    { key: '/dashboard', Icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
    // Products is admin-only (per main update)
    ...(userRole === 'ADMIN' ? [{ key: '/products', Icon: Upload, label: 'Products', to: '/products' }] : []),
    ...(userRole !== 'APPROVER' && userRole !== 'CATEGORY_HEAD'
      ? [{ key: '/extraction', Icon: Upload, label: 'Extraction', to: '/extraction' }]
      : []),
    ...(userRole === 'ADMIN' ||
    userRole === 'APPROVER' ||
    userRole === 'CATEGORY_HEAD' ||
    userRole === 'SUB_DIVISION_HEAD' ||
    userRole === 'CREATOR'
      ? [
          {
            key: 'approver-group',
            Icon: CheckSquare,
            label: 'Approver',
            children: [
              { key: '/approver', Icon: FileText, label: 'New Articles', to: '/approver' },
              { key: '/approver/old-articles', Icon: History, label: 'Old Articles', to: '/approver/old-articles' },
              { key: '/approver/rejected', Icon: XCircle, label: 'Rejected', to: '/approver/rejected' },
              { key: '/approver/created', Icon: CheckCircle2, label: 'Created', to: '/approver/created' },
            ],
          },
        ]
      : []),
    ...(userRole === 'ADMIN' ||
    userRole === 'APPROVER' ||
    userRole === 'CATEGORY_HEAD' ||
    userRole === 'SUB_DIVISION_HEAD'
      ? [{ key: '/po-presentation', Icon: FileType2, label: 'PO Presentation', to: '/po-presentation' }]
      : []),
    ...(userRole === 'ADMIN'
      ? [
          {
            key: 'admin-group',
            Icon: Settings,
            label: 'Admin',
            children: [
              { key: '/admin', Icon: Settings, label: 'Admin Dashboard', to: '/admin' },
              { key: '/admin/srm-failed', Icon: AlertTriangle, label: 'Failed Extractions', to: '/admin/srm-failed' },
            ],
          },
        ]
      : []),
  ];

  const renderItem = (item: SidebarItem) => {
    const active = selectedKey === item.key;
    if (item.children) {
      return (
        <li key={item.key} className="flex flex-col">
          <div className="flex items-center gap-3 px-4 py-2 text-xs uppercase tracking-wide text-neutral-400">
            <item.Icon className="h-4 w-4" />
            {!collapsed && item.label}
          </div>
          <ul className="ml-3">{item.children.map(renderItem)}</ul>
        </li>
      );
    }
    return (
      <li key={item.key}>
        <Link
          to={item.to ?? item.key}
          className={cn(
            'flex items-center gap-3 px-4 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10',
            active && 'bg-primary/20 text-white',
          )}
        >
          <item.Icon className="h-4 w-4" />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </li>
    );
  };

  return (
    <aside className={cn('flex flex-col bg-neutral-900 text-white transition-all', collapsed ? 'w-16' : 'w-56')}>
      <div className="m-4 h-8 rounded bg-white/20" />
      <ul className="flex flex-col gap-0.5">{items.map(renderItem)}</ul>
    </aside>
  );
}
