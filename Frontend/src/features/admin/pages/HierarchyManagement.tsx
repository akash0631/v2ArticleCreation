/**
 * Hierarchy Management Page
 * Multi-tab admin UI for managing departments, categories and attribute mappings.
 */

import { useState } from 'react';
import { Layout, Tabs, Button, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  ApartmentOutlined,
  BgColorsOutlined,
  DownloadOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, getHierarchyTree } from '../../../services/adminApi';
import { HierarchyStats } from '../components/HierarchyStats';
import { HierarchyTree } from '../components/HierarchyTree';
import { AttributeManager } from '../components/AttributeManager';
import { HierarchyTreeEditor } from '../components/HierarchyTreeEditor';
import { CategoryAttributeMapper } from '../components/CategoryAttributeMapper';
import VLMStatusPanel from '../../../components/vlm/VLMStatusPanel';

const { Content } = Layout;
const { Title, Text } = Typography;

type TabType = 'hierarchy' | 'mappings' | 'attributes' | 'overview';

export default function HierarchyManagement() {
  const [activeTab, setActiveTab] = useState<TabType>('hierarchy');

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
      key: 'hierarchy',
      label: <span><ApartmentOutlined /> Hierarchy</span>,
      children: (
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Each department is shown as a card. Expand sub-departments to see categories.
              Use the <strong>pencil</strong> icon to rename, <strong>trash</strong> to delete, and the dashed buttons to add.
              Go to the <strong>Attribute Mapping</strong> tab to manage which attributes are extracted per category.
            </Text>
          </div>
          <HierarchyTreeEditor />
        </div>
      ),
    },
    {
      key: 'mappings',
      label: <span><LinkOutlined /> Attribute Mapping</span>,
      children: (
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Select a category to manage which of the 45 master attributes are
              extracted for it. Toggle <strong>Enabled</strong> to include an attribute,
              and <strong>Required</strong> to make it mandatory. Click <strong>Save Changes</strong> to apply.
            </Text>
          </div>
          <CategoryAttributeMapper />
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
