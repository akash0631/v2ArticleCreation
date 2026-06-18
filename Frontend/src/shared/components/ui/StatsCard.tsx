import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Statistic } from '@/shared/components/ui-tw';

interface StatItem {
  label: string;
  value: string | number;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
}

interface StatsCardProps {
  title: string;
  stats: StatItem[];
}

const colorMap: Record<string, string> = {
  blue: '#FF6F61',
  green: '#52c41a',
  orange: '#fa8c16',
  red: '#ff4d4f',
  purple: '#722ed1',
};

export const StatsCard: React.FC<StatsCardProps> = ({ title, stats }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {stats.map((stat, index) => (
          <Statistic
            key={index}
            title={stat.label}
            value={stat.value}
            valueStyle={stat.color ? { color: colorMap[stat.color] } : { color: '#262626' }}
          />
        ))}
      </CardContent>
    </Card>
  );
};
