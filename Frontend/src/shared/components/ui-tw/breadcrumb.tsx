import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  title: React.ReactNode;
  href?: string;
}

interface BreadcrumbProps extends React.HTMLAttributes<HTMLOListElement> {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, separator, className, ...props }) => {
  return (
    <ol className={cn('flex items-center gap-1 text-sm text-muted-foreground', className)} {...props}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            <li className={cn(isLast && 'font-medium text-foreground')}>
              {item.href && !isLast ? (
                <a href={item.href} className="hover:text-foreground">
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </li>
            {!isLast && <li aria-hidden="true">{separator ?? <ChevronRight className="h-3.5 w-3.5" />}</li>}
          </React.Fragment>
        );
      })}
    </ol>
  );
};
