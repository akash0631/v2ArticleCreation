import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepItem {
  title: React.ReactNode;
  icon?: React.ReactNode;
}

interface StepsProps {
  current: number;
  items: StepItem[];
  size?: 'sm' | 'default';
  className?: string;
}

export const Steps: React.FC<StepsProps> = ({ current, items, className }) => {
  return (
    <ol className={cn('flex items-center gap-2', className)}>
      {items.map((item, idx) => {
        const isDone = idx < current;
        const isActive = idx === current;
        return (
          <React.Fragment key={idx}>
            <li className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm',
                  isDone && 'border-primary bg-primary text-primary-foreground',
                  isActive && 'border-primary text-primary',
                  !isDone && !isActive && 'border-border text-muted-foreground',
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : item.icon ?? idx + 1}
              </span>
              <span
                className={cn(
                  'text-sm',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.title}
              </span>
            </li>
            {idx < items.length - 1 && <li className="h-px min-w-6 flex-1 bg-border" aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </ol>
  );
};
