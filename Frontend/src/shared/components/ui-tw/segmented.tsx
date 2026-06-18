import * as React from 'react';
import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string = string> {
  value: T;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string = string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'h-8 text-xs',
  md: 'h-9 text-sm',
  lg: 'h-10 text-base',
};

export function Segmented<T extends string = string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex items-center rounded-md bg-muted p-1', sizeClass[size], className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
