import * as React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ResultStatus = 'success' | 'error' | 'warning' | 'info' | '404' | '500' | '403';

interface ResultProps {
  status?: ResultStatus;
  title?: React.ReactNode;
  subTitle?: React.ReactNode;
  extra?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const iconForStatus = (status: ResultStatus): React.ReactNode => {
  const cls = 'h-16 w-16';
  switch (status) {
    case 'success':
      return <CheckCircle2 className={cn(cls, 'text-emerald-500')} />;
    case 'error':
    case '500':
      return <XCircle className={cn(cls, 'text-red-500')} />;
    case 'warning':
    case '403':
      return <AlertTriangle className={cn(cls, 'text-amber-500')} />;
    case '404':
      return <AlertCircle className={cn(cls, 'text-muted-foreground')} />;
    case 'info':
    default:
      return <Info className={cn(cls, 'text-sky-500')} />;
  }
};

export const Result: React.FC<ResultProps> = ({
  status = 'info',
  title,
  subTitle,
  extra,
  icon,
  className,
  children,
}) => {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-12 text-center', className)}>
      <div className="flex items-center justify-center">{icon ?? iconForStatus(status)}</div>
      {title && <div className="text-2xl font-semibold text-foreground">{title}</div>}
      {subTitle && <div className="max-w-xl text-sm text-muted-foreground">{subTitle}</div>}
      {children && <div className="w-full max-w-2xl">{children}</div>}
      {extra && <div className="flex flex-wrap items-center justify-center gap-3">{extra}</div>}
    </div>
  );
};
