import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputNumberProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value?: number | null;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const InputNumber = React.forwardRef<HTMLInputElement, InputNumberProps>(
  ({ className, value, onChange, min, max, step = 1, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange?.(v === '' ? null : Number(v));
        }}
        min={min}
        max={max}
        step={step}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
InputNumber.displayName = 'InputNumber';
