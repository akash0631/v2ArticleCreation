import * as React from 'react';
import { cn } from '@/lib/utils';

interface UploadProps {
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  /** Called for each file. Return false to reject (kept for antd-compat). */
  beforeUpload?: (file: File) => boolean | Promise<boolean>;
  /** Hidden button trigger. */
  children: React.ReactNode;
  className?: string;
}

export const Upload: React.FC<UploadProps> = ({
  multiple,
  accept,
  disabled,
  beforeUpload,
  children,
  className,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const ok = beforeUpload ? await beforeUpload(file) : true;
      if (ok === false) break;
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <label className={cn('inline-block', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={onChange}
      />
      {children}
    </label>
  );
};
