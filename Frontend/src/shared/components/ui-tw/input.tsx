import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  allowClear?: boolean;
  onClear?: () => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, allowClear, onClear, value, onChange, ...props }, ref) => {
    if (prefix || suffix) {
      return (
        <div
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring',
            className,
          )}
        >
          {prefix && <span className="flex items-center text-muted-foreground">{prefix}</span>}
          <input
            type={type}
            ref={ref}
            value={value}
            onChange={onChange}
            className="h-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            {...props}
          />
          {allowClear && value && (
            <button
              type="button"
              onClick={() => onClear?.()}
              className="text-muted-foreground hover:text-foreground"
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
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
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
          className="text-xs text-muted-foreground hover:text-foreground"
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
