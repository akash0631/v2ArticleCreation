import { useState } from 'react';
import { Menu, Layout } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UploadOutlined,
  SettingOutlined,

  HomeOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

interface SidebarProps {
  collapsed?: boolean;
  userRole?: string;
}

export default function Sidebar({ collapsed = false, userRole }: SidebarProps) {
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState(location.pathname);

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: <Link to="/">Home</Link>,
    },
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">Dashboard</Link>,
    },
    ...(userRole !== 'APPROVER' && userRole !== 'CATEGORY_HEAD' ? [{
      key: '/products',
      icon: <UploadOutlined />,
      label: <Link to="/products">Products</Link>,
    }] : []),
    {
      key: '/extraction',
      icon: <UploadOutlined />,
      label: <Link to="/extraction">Extraction</Link>,
    },
    // Approver Dashboard - Visible to ADMIN, APPROVER and CATEGORY_HEAD
    ...((userRole === 'ADMIN' || userRole === 'APPROVER' || userRole === 'CATEGORY_HEAD') ? [{
      key: '/approver',
      icon: <CheckSquareOutlined />,
      label: <Link to="/approver">Approver</Link>,
    }] : []),
    ...(userRole === 'ADMIN' ? [{
      key: '/admin',
      icon: <SettingOutlined />,
      label: <Link to="/admin">Admin</Link>,
    }] : []),
  ];

  return (
    <Sider trigger={null} collapsible collapsed={collapsed}>
      <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)' }} />
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => setSelectedKey(key)}
      />
    </Sider>
  );
}