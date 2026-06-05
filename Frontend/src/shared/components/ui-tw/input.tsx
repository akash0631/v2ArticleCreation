import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  allowClear?: boolean;
  onClear?: () => void;
  /** When true, paints the border in coral and shows an error halo on focus. */
  invalid?: boolean;
}

const baseField = [
  'flex h-9 w-full rounded-[var(--radius-control)] bg-background px-3 py-1 text-sm',
  'border border-input shadow-[var(--shadow-xs)]',
  'transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-out-quart)]',
  'placeholder:text-muted-foreground/70',
  'hover:border-foreground/25',
  'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/40',
  'file:border-0 file:bg-transparent file:text-sm file:font-medium',
].join(' ');

const invalidField = [
  '!border-destructive',
  'focus-visible:!border-destructive focus-visible:!ring-destructive/20',
].join(' ');

const wrapperField = [
  'flex h-9 w-full items-center gap-2 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm',
  'shadow-[var(--shadow-xs)]',
  'transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-out-quart)]',
  'hover:border-foreground/25',
  'focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20',
].join(' ');

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, allowClear, onClear, invalid, value, onChange, ...props }, ref) => {
    if (prefix || suffix || allowClear) {
      return (
        <div className={cn(wrapperField, invalid && invalidField, className)}>
          {prefix && <span className="flex items-center text-muted-foreground">{prefix}</span>}
          <input
            type={type}
            ref={ref}
            value={value}
            onChange={onChange}
            className="h-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50"
            {...props}
          />
          {allowClear && value && (
            <button
              type="button"
              onClick={() => onClear?.()}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear"
            >
              ×
            </button>
          )}
          {suffix && <span className="flex items-center text-muted-foreground">{suffix}</span>}
        </div>
      );
    }

    return (
      <input
        type={type}
        ref={ref}
        value={value}
        onChange={onChange}
        className={cn(baseField, invalid && invalidField, className)}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[60px] w-full rounded-[var(--radius-control)] bg-background px-3 py-2 text-sm',
        'border border-input shadow-[var(--shadow-xs)]',
        'transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-quart)]',
        'placeholder:text-muted-foreground/70',
        'hover:border-foreground/25',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && invalidField,
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

/** Antd-compat: Input.Password */
const InputPassword = React.forwardRef<HTMLInputElement, InputProps>(({ ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  return (
    <Input
      ref={ref}
      type={show ? 'text' : 'password'}
      suffix={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      }
      {...props}
    />
  );
});
InputPassword.displayName = 'Input.Password';

/** Antd-compat: Input.TextArea */
type InputComponent = typeof Input & { Password: typeof InputPassword; TextArea: typeof Textarea };
const InputWithStatics = Input as InputComponent;
InputWithStatics.Password = InputPassword;
InputWithStatics.TextArea = Textarea;

export { InputWithStatics as Input, Textarea, InputPassword };
