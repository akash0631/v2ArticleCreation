/**
 * Hierarchy Stats Component
 * Displays dashboard statistics
 */
import { Building2, Folder, Tags, Palette, Star } from 'lucide-react';
import { Card, CardContent, Skeleton, Statistic } from '@/shared/components/ui-tw';
import type { DashboardStats } from '../../../services/adminApi';

interface HierarchyStatsProps {
  stats?: DashboardStats;
  loading: boolean;
}

export const HierarchyStats = ({ stats, loading }: HierarchyStatsProps) => {
  // Slate + coral + sunset + emerald palette (no blue / purple / pink)
  const statCards = [
    { title: 'Departments', value: stats?.departments || 0, Icon: Building2, color: '#FF6F61' },
    { title: 'Sub-Departments', value: stats?.subDepartments || 0, Icon: Folder, color: '#FFA62B' },
    { title: 'Categories', value: stats?.categories || 0, Icon: Tags, color: '#10b981' },
    { title: 'Master Attributes', value: stats?.masterAttributes || 0, Icon: Palette, color: '#1f2937' },
    { title: 'Allowed Values', value: stats?.allowedValues || 0, Icon: Star, color: '#FF6F61' },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {statCards.map((stat, index) => (
        <Card
          key={index}
          className="cursor-pointer rounded-lg border-0 shadow-sm transition-all duration-300 hover:shadow-md"
        >
          <CardContent className="px-6 py-5">
            <div className="flex items-start justify-between">
              <Statistic title={stat.title} value={stat.value} valueStyle={{ color: stat.color }} />
              <div className="mt-1">
                <stat.Icon className="h-6 w-6" style={{ color: stat.color }} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
