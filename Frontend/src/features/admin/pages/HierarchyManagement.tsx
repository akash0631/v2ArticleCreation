/**
 * Hierarchy Management Page
 * Tab 1 (primary): Attribute Mapping — search a category, toggle its attributes
 * Tab 2: Hierarchy — browse dept/sub-dept/category structure, click category → jumps to Tab 1
 * Tab 3: Master Attributes — manage the 45 attribute definitions
 * Tab 4: Overview — stats
 */

import { useState } from 'react';
import { Layout, Tabs, Button, Typography } from 'antd';
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
import type { SelectedCategory } from '../components/HierarchyTreeEditor';
import VLMStatusPanel from '../../../components/vlm/VLMStatusPanel';

const { Content } = Layout;
const { Title, Text } = Typography;

type TabType = 'mappings' | 'hierarchy' | 'attributes' | 'overview';

export default function HierarchyManagement() {
  const [activeTab, setActiveTab] = useState<TabType>('mappings');
  const [jumpCategory, setJumpCategory] = useState<SelectedCategory | null>(null);

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

  // Called when a category row in the Hierarchy tab is clicked
  const handleCategorySelectFromTree = (cat: SelectedCategory) => {
    setJumpCategory(cat);
    setActiveTab('mappings');
  };

  const tabItems = [
    {
      key: 'mappings',
      label: <span><LinkOutlined /> Attribute Mapping</span>,
      children: (
        <div style={{ padding: '16px 24px' }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">
              Search or browse the category list on the left. Select a category to view and toggle its attributes on the right.
              Changes are saved per-category — click <strong>Save Changes</strong> after toggling.
            </Text>
          </div>
          <CategoryAttributeMapper initialCategory={jumpCategory} />
        </div>
      ),
    },
    {
      key: 'hierarchy',
      label: <span><ApartmentOutlined /> Hierarchy</span>,
      children: (
        <div style={{ padding: '16px 24px' }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">
              Browse departments, sub-departments, and categories.
              Use the <strong>pencil</strong> icon to rename and <strong>trash</strong> to delete.
              Click any <strong>category row</strong> to jump straight to its attribute mapping.
            </Text>
          </div>
          <HierarchyTreeEditor onCategorySelect={handleCategorySelectFromTree} />
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
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <VLMStatusPanel />
          <HierarchyStats stats={stats} loading={statsLoading} />
          <HierarchyTree hierarchy={hierarchy} loading={hierarchyLoading} />
        </div>
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
