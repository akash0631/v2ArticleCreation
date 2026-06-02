import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent, Empty } from '@/shared/components/ui-tw';

const POPresentationPage: React.FC = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="m-0 flex items-center gap-2.5 text-2xl font-semibold text-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6F61] to-[#FFA62B] shadow-md">
            <FileText className="h-4 w-4 text-white" />
          </div>
          PO Presentation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Purchase Order Presentation</p>
      </div>

      <Card className="glass card-3d rounded-2xl border border-white/60">
        <CardContent className="pt-6">
          <Empty
            icon={<FileText className="h-16 w-16 text-muted-foreground/40" />}
            description="PO Presentation content coming soon"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default POPresentationPage;
