/**
 * Hierarchy Management Page
 * Tree-based editor for departments, sub-departments, categories and attribute mappings.
 */

import { useState } from 'react';
import { Layout, Tabs, Button, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  ApartmentOutlined,
  BgColorsOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, getHierarchyTree } from '../../../services/adminApi';
import { HierarchyStats } from '../components/HierarchyStats';
import { HierarchyTree } from '../components/HierarchyTree';
import { AttributeManager } from '../components/AttributeManager';
import { HierarchyTreeEditor } from '../components/HierarchyTreeEditor';
import VLMStatusPanel from '../../../components/vlm/VLMStatusPanel';

const { Content } = Layout;
const { Title, Text } = Typography;

type TabType = 'overview' | 'tree' | 'attributes';

export default function HierarchyManagement() {
  const [activeTab, setActiveTab] = useState<TabType>('tree');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['hierarchy-stats'],
    queryFn: getDashboardStats,
  });

  const { data: hierarchy, isLoading: hierarchyLoading } = useQuery({
    queryKey: ['hierarchy-tree'],
    queryFn: getHierarchyTree,
  });

  const handleExport = async () => {
    try {
      const { exportHierarchy } = await import('../../../services/adminApi');
      const blob = await exportHierarchy();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hierarchy-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      console.error('Export failed');
    }
  };

  const tabItems = [
    {
      key: 'tree',
      label: <span><ApartmentOutlined /> Hierarchy & Mappings</span>,
      children: (
        <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Click any <strong>category</strong> in the tree to manage which attributes are extracted for it.
              Use the ✏ and 🗑 icons to rename or remove nodes. Add new nodes with the dashed buttons.
            </Text>
          </div>
          <HierarchyTreeEditor />
        </div>
      ),
    },
    {
      key: 'attributes',
      label: <span><BgColorsOutlined /> Master Attributes</span>,
      children: <div style={{ padding: '24px' }}><AttributeManager /></div>,
    },
    {
      key: 'overview',
      label: <span><DashboardOutlined /> Overview</span>,
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%', padding: '24px' }}>
          <VLMStatusPanel />
          <HierarchyStats stats={stats} loading={statsLoading} />
          <HierarchyTree hierarchy={hierarchy} loading={hierarchyLoading} />
        </Space>
      ),
    },
  ];

  return (
    <Layout className="page-scroll-enabled" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: '24px' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{
            background: '#fff', padding: '20px 24px', marginBottom: 24,
            borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 1px 6px rgba(0,0,0,0.02)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Title level={2} style={{ margin: 0 }}>Hierarchy Management</Title>
                <Text type="secondary">
                  Manage departments, categories &amp; extraction attributes — changes reflect in the app within 5 minutes
                </Text>
              </div>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>
                Export JSON
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <Tabs
              activeKey={activeTab}
              onChange={k => setActiveTab(k as TabType)}
              items={tabItems}
              size="large"
              style={{ padding: '0 24px' }}
              tabBarStyle={{ marginBottom: 0 }}
            />
          </div>
        </div>
      </Content>
    </Layout>
  );
}
