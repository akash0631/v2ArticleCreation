import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Info, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground border-border',
        info: 'border-sky-200 bg-sky-50 text-sky-900 [&>svg]:text-sky-600',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&>svg]:text-emerald-600',
        warning: 'border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600',
        error: 'border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-600',
        destructive: 'border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const iconMap = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  destructive: AlertCircle,
};

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  message?: React.ReactNode;
  description?: React.ReactNode;
  showIcon?: boolean;
  type?: 'info' | 'success' | 'warning' | 'error';
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, message, description, showIcon, type, children, ...props }, ref) => {
    const v = type ?? variant ?? 'default';
    const Icon = iconMap[v as keyof typeof iconMap] || Info;
    return (
      <div ref={ref} role="alert" className={cn(alertVariants({ variant: v }), className)} {...props}>
        {showIcon && <Icon className="h-4 w-4" />}
        {message ? (
          <>
            <div className="font-medium leading-none tracking-tight">{message}</div>
            {description && <div className="mt-1 text-sm opacity-90 [&_p]:leading-relaxed">{description}</div>}
          </>
        ) : (
          children
        )}
      </div>
    );
  },
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
