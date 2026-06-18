import * as React from 'react';
import { cn } from '@/lib/utils';

interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
  bgColor?: string;
  borderColor?: string;
  icon?: React.ReactNode;
}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, color, bgColor, borderColor, icon, style, children, ...props }, ref) => {
    const inlineStyle: React.CSSProperties = {
      ...(color && { color }),
      ...(bgColor && { backgroundColor: bgColor }),
      ...(borderColor && { borderColor }),
      ...style,
    };
    return (
      <span
        ref={ref}
        style={inlineStyle}
        className={cn(
          'inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium',
          className,
        )}
        {...props}
      >
        {icon}
        {children}
      </span>
    );
  },
);
Tag.displayName = 'Tag';
