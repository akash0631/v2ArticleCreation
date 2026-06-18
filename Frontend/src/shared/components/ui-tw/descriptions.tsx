import * as React from 'react';
import { cn } from '@/lib/utils';

interface DescriptionsContextValue {
  bordered?: boolean;
  column?: number;
}

const DescriptionsContext = React.createContext<DescriptionsContextValue>({});

interface DescriptionsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  bordered?: boolean;
  column?: number;
}

interface DescriptionsItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  span?: number;
}

const Item: React.FC<DescriptionsItemProps> = ({ label, children, className, ...props }) => {
  const { bordered } = React.useContext(DescriptionsContext);
  return (
    <div
      className={cn(
        'flex',
        bordered ? 'border-b border-border last:border-b-0' : 'py-2',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'w-1/3 text-sm font-medium text-muted-foreground',
          bordered && 'border-r border-border bg-muted/50 p-3',
        )}
      >
        {label}
      </div>
      <div className={cn('flex-1 text-sm text-foreground', bordered && 'p-3')}>{children}</div>
    </div>
  );
};

interface DescriptionsComponent extends React.FC<DescriptionsProps> {
  Item: typeof Item;
}

const Descriptions: DescriptionsComponent = ({
  title,
  bordered,
  column = 1,
  className,
  children,
  ...props
}) => {
  return (
    <DescriptionsContext.Provider value={{ bordered, column }}>
      <div className={cn(bordered && 'rounded-md border border-border', className)} {...props}>
        {title && (
          <div className={cn('text-base font-semibold', bordered ? 'p-3 border-b border-border' : 'mb-2')}>
            {title}
          </div>
        )}
        <div className="flex flex-col">{children}</div>
      </div>
    </DescriptionsContext.Provider>
  );
};

Descriptions.Item = Item;

export { Descriptions };
