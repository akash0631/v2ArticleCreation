import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Side = 'left' | 'right' | 'top' | 'bottom';

const Drawer = DialogPrimitive.Root;
const DrawerTrigger = DialogPrimitive.Trigger;
const DrawerClose = DialogPrimitive.Close;
const DrawerPortal = DialogPrimitive.Portal;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DrawerOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sideClass: Record<Side, string> = {
  left: 'left-0 top-0 h-full data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  right: 'right-0 top-0 h-full data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  top: 'top-0 left-0 w-full data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom: 'bottom-0 left-0 w-full data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
};

interface DrawerContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  side?: Side;
  title?: React.ReactNode;
  showClose?: boolean;
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = 'right', title, showClose = true, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col gap-2 bg-background shadow-xl transition data-[state=open]:animate-in data-[state=closed]:animate-out',
        side === 'left' || side === 'right' ? 'w-[320px] max-w-[90vw]' : 'h-[60vh] max-h-[90vh]',
        sideClass[side],
        className,
      )}
      {...props}
    >
      {(title || showClose) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-base font-semibold">{title}</div>
          {showClose && (
            <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </DialogPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent };
