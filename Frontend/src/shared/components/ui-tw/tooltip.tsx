import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Antd-style convenience Tooltip — wrap a trigger child + provide title.
 * Usage: <Tooltip title="Hi"><Button>Hover</Button></Tooltip>
 */
interface TooltipProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  asChild?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ title, children, side = 'top', asChild = true }) => {
  if (!title) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={200}>
      <TooltipRoot>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent side={side}>{title}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
};

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };
