import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  tip?: React.ReactNode;
  spinning?: boolean;
  children?: React.ReactNode;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export const Spinner: React.FC<SpinnerProps> = ({
  className,
  size = 'md',
  tip,
  spinning = true,
  children,
  ...props
}) => {
  if (children) {
    return (
      <div className={cn('relative', className)} {...props}>
        <div className={cn(spinning && 'pointer-events-none opacity-50')}>{children}</div>
        {spinning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/30">
            <Loader2 className={cn('animate-spin text-primary', sizeMap[size])} />
            {tip && <span className="text-sm text-muted-foreground">{tip}</span>}
          </div>
        )}
      </div>
    );
  }
  if (!spinning) return null;
  return (
    <div className={cn('inline-flex flex-col items-center gap-2', className)} {...props}>
      <Loader2 className={cn('animate-spin text-primary', sizeMap[size])} />
      {tip && <span className="text-sm text-muted-foreground">{tip}</span>}
    </div>
  );
};

export { Spinner as Spin };
