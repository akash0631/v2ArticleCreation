import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent, Empty } from '@/shared/components/ui-tw';

const POPresentationPage: React.FC = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="m-0 flex items-center gap-2.5 text-2xl font-semibold text-foreground">
          <FileText className="h-6 w-6 text-primary" />
          PO Presentation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Purchase Order Presentation</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Empty
            icon={<FileText className="h-16 w-16" />}
            description="PO Presentation content coming soon"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default POPresentationPage;
