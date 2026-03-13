import React, { useEffect, useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button, Badge, Space, Typography, Breadcrumb, List, Empty, Divider } from 'antd';
import {
  HomeOutlined,
  ShoppingOutlined,
  FileSearchOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
  GlobalOutlined,
  ControlOutlined,
  SettingOutlined,
  CheckSquareOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import './MainLayout.css';
import {
  getNotifications,
  markAllRead,
  markRead,
  clearNotifications,
  type NotificationItem
} from '../../services/notifications/notificationStore';
import { resetExtractionSession } from '../../hooks/extraction/useImageExtraction';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

interface MainLayoutProps {
  children: React.ReactNode;
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
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
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

  const getMenuItems = () => {
    const menuItems = [
      { key: '/dashboard', icon: <HomeOutlined />, label: 'Home' },
    ];

    // Only show Products to non-Approver roles
    if (userData?.role !== 'APPROVER' && userData?.role !== 'CATEGORY_HEAD') {
      menuItems.push({ key: '/products', icon: <ShoppingOutlined />, label: 'Products' });
    }

    // Only show Extraction to creator-side roles
    if (userData?.role !== 'APPROVER' && userData?.role !== 'CATEGORY_HEAD') {
      menuItems.push({ key: '/extraction', icon: <FileSearchOutlined />, label: 'Extraction' });
    }

    const adminItems = [
      {
        key: '/admin',
        icon: <ControlOutlined />,
        label: 'Admin Panel',
        children: [
          { key: '/admin/hierarchy', icon: <GlobalOutlined />, label: 'Hierarchy Management' },
          { key: '/admin/users', icon: <UserOutlined />, label: 'User Management' },
          { key: '/admin/expenses', icon: <ShoppingOutlined />, label: 'Expense Viewer' },
        ],
      },
    ];

    const approverItems = [
      { key: '/approver', icon: <CheckSquareOutlined />, label: 'Approver Dashboard' },
    ];

    if (!isAuthenticated) return [];

    // Combine items based on role
    let items = [...menuItems];

    if (userData?.role === 'APPROVER' || userData?.role === 'CATEGORY_HEAD' || isAdmin) {
      items = [...items, ...approverItems];
    }

    if (isAdmin) {
      items = [...items, ...adminItems];
    }

    return items;
  };

  const userMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: 'Profile',
        onClick: () => navigate('/profile'),
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Settings',
        onClick: () => navigate('/profile'),
      },
      { key: 'divider', type: 'divider' as const },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Logout',
        onClick: () => {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          resetExtractionSession();
          navigate('/');
        },
      },
    ],
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const isAuthPage = ['/login', '/register'].includes(location.pathname);
  const isLandingPage = location.pathname === '/';

  if (isAuthPage) {
    return <div className="auth-layout">{children}</div>;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString();
  };

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh' }}>
      <Header className="top-nav">
        <div className="top-nav-left">
          <div className="brand" onClick={() => navigate('/dashboard')}>
            <GlobalOutlined />
            <span>AI Fashion</span>
          </div>

          {!isLandingPage && !isMobile && (
            <Breadcrumb
              items={[
                { title: 'Home' },
                { title: location.pathname.slice(1).charAt(0).toUpperCase() + location.pathname.slice(2) },
              ]}
            />
          )}

          {isAuthenticated && !isLandingPage && (
            <Menu
              mode="horizontal"
              selectedKeys={[location.pathname]}
              items={getMenuItems()}
              onClick={handleMenuClick}
              className="top-nav-menu"
            />
          )}
        </div>

        <Space size="middle">
          {isAuthenticated ? (
            <>
              <Dropdown
                trigger={['click']}
                dropdownRender={() => (
                  <div className="notification-dropdown">
                    <div className="notification-header">
                      <Text strong>Notifications</Text>
                      <Space size={8}>
                        <Button type="link" size="small" onClick={markAllRead} disabled={!unreadCount}>
                          Mark all read
                        </Button>
                        <Button type="link" size="small" onClick={clearNotifications}>
                          Clear
                        </Button>
                      </Space>
                    </div>
                    <Divider style={{ margin: '8px 0' }} />
                    {notifications.length === 0 ? (
                      <Empty description="No notifications" style={{ padding: '12px 0' }} />
                    ) : (
                      <List
                        dataSource={notifications}
                        renderItem={(item) => (
                          <List.Item
                            className={`notification-item ${item.read ? 'read' : 'unread'}`}
                            onClick={() => markRead(item.id)}
                          >
                            <List.Item.Meta
                              title={<Text strong={!item.read}>{item.title}</Text>}
                              description={
                                <div>
                                  <div>{item.description}</div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    {formatTime(item.createdAt)}
                                  </Text>
                                </div>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    )}
                  </div>
                )}
              >
                <Badge count={unreadCount} size="small">
                  <Button type="text" icon={<BellOutlined />} shape="circle" size="large" />
                </Badge>
              </Dropdown>
              <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
                <div className="user-chip">
                  {!isMobile && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 4 }}>
                      <Text strong style={{ lineHeight: '1.2' }}>{userData?.name || 'User'}</Text>
                      <Text type="secondary" style={{ fontSize: '11px', lineHeight: '1.2' }}>
                        {userData?.role
                          ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1).toLowerCase()
                          : 'Member'}
                      </Text>
                    </div>
                  )}
                  <Avatar
                    size="large"
                    icon={<UserOutlined />}
                    style={{ backgroundColor: '#111827', color: '#fff' }}
                  />
                </div>
              </Dropdown>
            </>
          ) : (
            <Space>
              <Button onClick={() => navigate('/login')}>Login</Button>
              <Button type="primary" onClick={() => navigate('/register')}>Sign Up</Button>
            </Space>
          )}
        </Space>
      </Header>

      <Content className={isLandingPage ? 'content-landing' : 'content-shell'}>
        {children}
      </Content>

      <Footer className={isLandingPage ? 'footer-landing' : 'footer-shell'}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Text className={isLandingPage ? 'footer-text-light' : 'footer-text-dark'}>
            © 2025 AI Fashion Extractor. All rights reserved.
          </Text>
        </div>
      </Footer>
    </Layout>
  );
};

export default MainLayout;