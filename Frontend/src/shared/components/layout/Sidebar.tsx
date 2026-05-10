import { Menu, Layout } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UploadOutlined,
  SettingOutlined,
  HomeOutlined,
  CheckSquareOutlined,
  FileOutlined,
  HistoryOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

interface SidebarProps {
  collapsed?: boolean;
  userRole?: string;
}

export default function Sidebar({ collapsed = false, userRole }: SidebarProps) {
  const location = useLocation();
  const selectedKey = location.pathname;

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
    ...(userRole !== 'APPROVER' && userRole !== 'CATEGORY_HEAD' ? [{
      key: '/extraction',
      icon: <UploadOutlined />,
      label: <Link to="/extraction">Extraction</Link>,
    }] : []),
    // Approver Dashboard - Visible to ADMIN, APPROVER, CATEGORY_HEAD and SUB_DIVISION_HEAD
    ...((userRole === 'ADMIN' || userRole === 'APPROVER' || userRole === 'CATEGORY_HEAD' || userRole === 'SUB_DIVISION_HEAD') ? [{
      key: 'approver-group',
      icon: <CheckSquareOutlined />,
      label: 'Approver',
      children: [
        {
          key: '/approver',
          icon: <FileOutlined />,
          label: <Link to="/approver">New Articles</Link>,
        },
        {
          key: '/approver/old-articles',
          icon: <HistoryOutlined />,
          label: <Link to="/approver/old-articles">Old Articles</Link>,
        },
        {
          key: '/approver/rejected',
          icon: <CloseCircleOutlined />,
          label: <Link to="/approver/rejected">Rejected Articles</Link>,
        },
        {
          key: '/approver/created',
          icon: <CheckCircleOutlined />,
          label: <Link to="/approver/created">Created</Link>,
        },
      ],
    }] : []),
    ...((userRole === 'ADMIN' || userRole === 'APPROVER' || userRole === 'CATEGORY_HEAD' || userRole === 'SUB_DIVISION_HEAD') ? [{
      key: '/po-presentation',
      icon: <FileTextOutlined />,
      label: <Link to="/po-presentation">PO Presentation</Link>,
    }] : []),
    ...(userRole === 'ADMIN' ? [{
      key: '/admin',
      icon: <SettingOutlined />,
      label: <Link to="/admin">Admin</Link>,
    }] : []),
  ];

  const openKeys = selectedKey.startsWith('/approver') ? ['approver-group'] : [];

  return (
    <Sider trigger={null} collapsible collapsed={collapsed}>
      <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)' }} />
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        defaultOpenKeys={openKeys}
        items={menuItems}
      />
    </Sider>
  );
}