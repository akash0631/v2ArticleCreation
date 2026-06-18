/**
 * Hierarchy Management Page
 * Tab 1 (primary): Attribute Mapping — search a category, toggle its attributes
 * Tab 2: Hierarchy — browse dept/sub-dept/category structure, click category → jumps to Tab 1
 * Tab 3: Master Attributes — manage the 45 attribute definitions
 * Tab 4: Overview — stats
 */
import { useState } from 'react';
import { LayoutDashboard, Network, Palette, Download, Link2, ListTree, Ruler } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui-tw';
import { getDashboardStats, getHierarchyTree } from '../../../services/adminApi';
import { HierarchyStats } from '../components/HierarchyStats';
import { HierarchyTree } from '../components/HierarchyTree';
import { AttributeManager } from '../components/AttributeManager';
import { HierarchyTreeEditor } from '../components/HierarchyTreeEditor';
import { CategoryAttributeMapper } from '../components/CategoryAttributeMapper';
import { GridValuesEditor } from '../components/GridValuesEditor';
import { SizeMasterEditor } from '../components/SizeMasterEditor';
import type { SelectedCategory } from '../components/HierarchyTreeEditor';
import VLMStatusPanel from '../../../components/vlm/VLMStatusPanel';

type TabType = 'mappings' | 'grid-values' | 'size-master' | 'hierarchy' | 'attributes' | 'overview';

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

  const handleCategorySelectFromTree = (cat: SelectedCategory) => {
    setJumpCategory(cat);
    setActiveTab('mappings');
  };

  return (
    <div className="page-scroll-enabled min-h-screen">
      <div className="p-6">
        <div className="mx-auto max-w-[1600px]">
          {/* Header */}
          <Card className="mb-6 glass card-3d rounded-2xl border border-white/60 overflow-hidden">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <h1 className="m-0 text-2xl font-semibold">Hierarchy Management</h1>
                <p className="text-sm text-muted-foreground">
                  Manage departments, categories &amp; extraction attributes — changes reflect in the app within 5 minutes
                </p>
              </div>
              <Button onClick={handleExport}>
                <Download />
                Export JSON
              </Button>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Card className="glass rounded-2xl border border-white/60 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
              <div className="border-b border-border px-6">
                <TabsList className="bg-transparent">
                  <TabsTrigger value="mappings">
                    <Link2 className="mr-1 h-4 w-4" />
                    Attribute Mapping
                  </TabsTrigger>
                  <TabsTrigger value="grid-values">
                    <ListTree className="mr-1 h-4 w-4" />
                    Grid Values
                  </TabsTrigger>
                  <TabsTrigger value="size-master">
                    <Ruler className="mr-1 h-4 w-4" />
                    Size Master
                  </TabsTrigger>
                  <TabsTrigger value="hierarchy">
                    <Network className="mr-1 h-4 w-4" />
                    Hierarchy
                  </TabsTrigger>
                  <TabsTrigger value="attributes">
                    <Palette className="mr-1 h-4 w-4" />
                    Master Attributes
                  </TabsTrigger>
                  <TabsTrigger value="overview">
                    <LayoutDashboard className="mr-1 h-4 w-4" />
                    Overview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="mappings" className="m-0 px-6 py-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Search or browse the category list on the left. Select a category to view and toggle its attributes on the right.
                  Changes are saved per-category — click <strong>Save Changes</strong> after toggling.
                </p>
                <CategoryAttributeMapper initialCategory={jumpCategory} />
              </TabsContent>

              <TabsContent value="grid-values" className="m-0 px-6 py-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Browse the allowed grid values by <strong>group → attribute → major category</strong>.
                  Click a major category to view, add, or delete the values for that attribute.
                </p>
                <GridValuesEditor />
              </TabsContent>

              <TabsContent value="size-master" className="m-0 px-6 py-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Browse the active <strong>sizes per major category</strong> from the size master.
                  Click a major category to view, add, or remove its sizes — every change needs a
                  remark and is recorded with your name in the audit log.
                </p>
                <SizeMasterEditor />
              </TabsContent>

              <TabsContent value="hierarchy" className="m-0 px-6 py-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Browse departments, sub-departments, and categories.
                  Use the <strong>pencil</strong> icon to rename and <strong>trash</strong> to delete.
                  Click any <strong>category row</strong> to jump straight to its attribute mapping.
                </p>
                <HierarchyTreeEditor onCategorySelect={handleCategorySelectFromTree} />
              </TabsContent>

              <TabsContent value="attributes" className="m-0 p-6">
                <AttributeManager />
              </TabsContent>

              <TabsContent value="overview" className="m-0 flex flex-col gap-6 p-6">
                <VLMStatusPanel />
                <HierarchyStats stats={stats} loading={statsLoading} />
                <HierarchyTree hierarchy={hierarchy} loading={hierarchyLoading} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
