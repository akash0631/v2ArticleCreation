import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export const Empty: React.FC<EmptyProps> = ({
  icon,
  title,
  description,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      {title && <div className="text-base font-medium text-foreground">{title}</div>}
      {description && (
        <div className="max-w-sm text-sm text-muted-foreground">{description}</div>
      )}
      {children}
    </div>
  );
};
