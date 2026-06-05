import * as React from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value?: Dayjs | null;
  onChange?: (value: Dayjs | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder, className, disabled }) => {
  const stringValue = value ? value.format('YYYY-MM-DD') : '';
  return (
    <input
      type="date"
      value={stringValue}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        onChange?.(v ? dayjs(v) : null);
      }}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  );
};

interface RangePickerProps {
  value?: [Dayjs | null, Dayjs | null] | null;
  onChange?: (value: [Dayjs | null, Dayjs | null] | null) => void;
  placeholder?: [string, string];
  className?: string;
}

export const RangePicker: React.FC<RangePickerProps> = ({ value, onChange, placeholder, className }) => {
  const [start, end] = value || [null, null];
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <DatePicker
        value={start}
        placeholder={placeholder?.[0] ?? 'Start date'}
        onChange={(v) => onChange?.([v, end])}
        className="h-9"
      />
      <span className="text-muted-foreground">→</span>
      <DatePicker
        value={end}
        placeholder={placeholder?.[1] ?? 'End date'}
        onChange={(v) => onChange?.([start, v])}
        className="h-9"
      />
    </div>
  );
};
