import { Info } from 'lucide-react';
import { Alert, Card, CardContent, Empty } from '@/shared/components/ui-tw';

export default function UploadsList() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Uploads</h1>
      <Card>
        <CardContent className="pt-6">
          <Empty
            icon={<Info className="h-16 w-16 text-primary" />}
            description={
              <div className="flex flex-col items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">Upload Management Deprecated</h2>
                <p className="text-sm text-muted-foreground">
                  The upload management feature has been removed. Please use the extraction page to process images.
                </p>
                <Alert
                  type="info"
                  showIcon
                  message="Use AI Extraction Instead"
                  description="Navigate to the AI Extraction page from the sidebar to upload and process fashion images."
                  className="mt-2 text-left"
                />
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
