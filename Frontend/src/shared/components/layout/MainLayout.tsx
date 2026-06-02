import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  ShoppingBag,
  FileSearch,
  User,
  LogOut,
  Bell,
  Globe,
  SlidersHorizontal,
  Settings,
  CheckSquare,
  FileText,
  History,
  XCircle,
  CheckCircle2,
  Camera,
  AlertTriangle,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Breadcrumb,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from '@/shared/components/ui-tw';
import { cn } from '@/lib/utils';
import { PageTransition } from '../motion/PageTransition';
import './MainLayout.css';
import {
  getNotifications,
  markAllRead,
  markRead,
  clearNotifications,
  type NotificationItem,
} from '../../services/notifications/notificationStore';
import { resetExtractionSession } from '../../hooks/extraction/useImageExtraction';

interface MainLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  key: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  children?: NavItem[];
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = !!localStorage.getItem('authToken');
  const userData = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null;
  const isAdmin = userData?.role === 'ADMIN';
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadNotifications = () => {
      if (!userData?.id) {
        setNotifications([]);
        return;
      }
      setNotifications(getNotifications(userData.id));
    };

    loadNotifications();
    window.addEventListener('notifications:updated', loadNotifications);
    window.addEventListener('storage', loadNotifications);

    return () => {
      window.removeEventListener('notifications:updated', loadNotifications);
      window.removeEventListener('storage', loadNotifications);
    };
  }, [userData?.id]);

  const getMenuItems = (): NavItem[] => {
    if (!isAuthenticated) return [];

    const items: NavItem[] = [{ key: '/dashboard', Icon: Home, label: 'Home' }];

    const role = userData?.role;
    const isApproverSide = role === 'APPROVER' || role === 'CATEGORY_HEAD';

    if (isAdmin) {
      items.push({ key: '/products', Icon: ShoppingBag, label: 'Products' });
    }
    if (!isApproverSide) {
      items.push({ key: '/extraction', Icon: FileSearch, label: 'Extraction' });
      items.push({ key: '/model-generation', Icon: Camera, label: 'Model Generation' });
    }

    const approverChildren: NavItem[] = [
      { key: '/approver', Icon: FileText, label: 'New Articles' },
      { key: '/approver/old-articles', Icon: History, label: 'Old Articles' },
      { key: '/approver/rejected', Icon: XCircle, label: 'Rejected Articles' },
      { key: '/approver/created', Icon: CheckCircle2, label: 'Created' },
    ];

    if (
      role === 'APPROVER' ||
      role === 'CATEGORY_HEAD' ||
      role === 'SUB_DIVISION_HEAD' ||
      isAdmin ||
      role === 'CREATOR' ||
      role === 'PO_COMMITTEE'
    ) {
      items.push({ key: '/approver-group', Icon: CheckSquare, label: 'Approver', children: approverChildren });
    }

    if (role === 'APPROVER' || role === 'CATEGORY_HEAD' || role === 'SUB_DIVISION_HEAD' || isAdmin) {
      items.push({ key: '/po-presentation', Icon: FileText, label: 'PO Presentation' });
    }

    if (isAdmin) {
      items.push({
        key: '/admin',
        Icon: SlidersHorizontal,
        label: 'Admin Panel',
        children: [
          { key: '/admin/hierarchy', Icon: Globe, label: 'Hierarchy Management' },
          { key: '/admin/users', Icon: User, label: 'User Management' },
          { key: '/admin/expenses', Icon: ShoppingBag, label: 'Expense Viewer' },
          { key: '/admin/srm-failed', Icon: AlertTriangle, label: 'Failed Extractions' },
        ],
      });
    }

    return items;
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    resetExtractionSession();
    navigate('/');
  };

  const isAuthPage = ['/login', '/register'].includes(location.pathname);
  const isLandingPage = location.pathname === '/';

  if (isAuthPage) {
    return <div className="auth-layout">{children}</div>;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const menuItems = getMenuItems();

  const formatTime = (iso: string) => new Date(iso).toLocaleString();

  const isPathActive = (key: string) => location.pathname === key || location.pathname.startsWith(key + '/');

  const initials =
    (userData?.name || userData?.email || 'U')
      .split(/\s|@/)
      .map((p: string) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || 'U';

  return (
    <div className="main-layout flex h-screen flex-col overflow-hidden">
      <header className="top-nav glass flex items-center justify-between gap-4 px-6 sticky top-0 z-50">
        <div className="top-nav-left flex items-center gap-6">
          <div
            className="brand flex cursor-pointer items-center gap-2"
            onClick={() => navigate('/dashboard')}
          >
            <img src="/V2retail.png" alt="V2Retail" className="h-7 object-contain" />
            <span className="text-lg font-semibold">Article Creation</span>
          </div>

          {!isLandingPage && !isMobile && (
            <Breadcrumb
              items={[
                { title: 'Home' },
                {
                  title:
                    location.pathname.slice(1).charAt(0).toUpperCase() + location.pathname.slice(2),
                },
              ]}
            />
          )}

          {isAuthenticated && !isLandingPage && (
            <nav className="top-nav-menu flex items-center gap-1">
              {menuItems.map((item) => {
                if (item.children) {
                  const active = item.children.some((c) => isPathActive(c.key));
                  return (
                    <DropdownMenu key={item.key}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(active && 'bg-accent text-accent-foreground')}
                        >
                          <item.Icon className="h-4 w-4" />
                          {item.label}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {item.children.map((c) => (
                          <DropdownMenuItem key={c.key} onClick={() => navigate(c.key)}>
                            <c.Icon className="h-4 w-4" />
                            {c.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }
                const active = isPathActive(item.key);
                return (
                  <Button
                    key={item.key}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.key)}
                    className={cn(active && 'bg-accent text-accent-foreground')}
                  >
                    <item.Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative rounded-full">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -right-1 -top-1 h-4 min-w-[16px] justify-center px-1 text-[10px]"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="notification-dropdown w-80 p-0" align="end">
                  <div className="notification-header flex items-center justify-between p-3">
                    <span className="text-sm font-semibold">Notifications</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-1"
                        onClick={markAllRead}
                        disabled={!unreadCount}
                      >
                        Mark all read
                      </Button>
                      <Button variant="link" size="sm" className="h-auto px-1" onClick={clearNotifications}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="max-h-80 overflow-auto">
                    {notifications.length === 0 ? (
                      <Empty description="No notifications" className="py-3" />
                    ) : (
                      <ul className="divide-y divide-border">
                        {notifications.map((item) => (
                          <li
                            key={item.id}
                            className={cn(
                              'notification-item cursor-pointer p-3 transition-colors hover:bg-accent',
                              item.read ? 'read' : 'unread',
                            )}
                            onClick={() => markRead(item.id)}
                          >
                            <div className={cn('text-sm', !item.read && 'font-semibold')}>{item.title}</div>
                            <div className="text-sm text-muted-foreground">{item.description}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatTime(item.createdAt)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="user-chip flex items-center gap-2 rounded-md p-1 hover:bg-accent">
                    {!isMobile && (
                      <div className="mr-1 flex flex-col items-end leading-tight">
                        <span className="text-sm font-semibold">{userData?.name || 'User'}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {userData?.role
                            ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1).toLowerCase()
                            : 'Member'}
                        </span>
                      </div>
                    )}
                    <Avatar className="h-10 w-10 bg-neutral-900">
                      <AvatarFallback className="bg-neutral-900 text-white">{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/login')}>
                Login
              </Button>
              <Button onClick={() => navigate('/register')}>Sign Up</Button>
            </div>
          )}
        </div>
      </header>

      <main className={isLandingPage ? 'content-landing flex-1 overflow-auto' : 'content-shell'}>
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
};

export default MainLayout;
