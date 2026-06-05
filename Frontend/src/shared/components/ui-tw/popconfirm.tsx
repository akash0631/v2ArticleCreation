import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';

interface PopconfirmProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}

export const Popconfirm: React.FC<PopconfirmProps> = ({
  title,
  description,
  onConfirm,
  onCancel,
  okText = 'Yes',
  cancelText = 'No',
  disabled,
  children,
}) => {
  const [open, setOpen] = React.useState(false);

  if (disabled) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <div className="text-sm font-medium">{title}</div>
            {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
              onCancel?.();
            }}
          >
            {cancelText}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              onConfirm?.();
            }}
          >
            {okText}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
