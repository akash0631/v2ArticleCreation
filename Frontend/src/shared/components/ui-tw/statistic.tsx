import * as React from 'react';
import { cn } from '@/lib/utils';

interface StatisticProps {
  title?: React.ReactNode;
  value?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  valueStyle?: React.CSSProperties;
  className?: string;
}

export const Statistic: React.FC<StatisticProps> = ({
  title,
  value,
  prefix,
  suffix,
  valueStyle,
  className,
}) => {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {title && <div className="text-sm text-muted-foreground">{title}</div>}
      <div className="flex items-center gap-1 text-2xl font-semibold" style={valueStyle}>
        {prefix && <span className="text-base">{prefix}</span>}
        <span>{value}</span>
        {suffix && <span className="text-base">{suffix}</span>}
      </div>
    </div>
  );
};
