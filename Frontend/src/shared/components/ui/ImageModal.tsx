import React from 'react';
import { Download, Info } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tooltip,
} from '@/shared/components/ui-tw';

interface ImageModalProps {
  visible: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
  imageSize?: number;
  extractionData?: {
    confidence?: number;
    processingTime?: number;
    attributesFound?: number;
  };
}

export const ImageModal: React.FC<ImageModalProps> = ({
  visible,
  onClose,
  imageUrl,
  imageName,
  imageSize,
  extractionData,
}) => {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = imageName || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <Dialog open={visible} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1200px] w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <span>Image Details</span>
            {imageName && (
              <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{imageName}</code>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="text-center">
          <div className="mb-6 max-h-[70vh] overflow-hidden rounded-lg border border-border">
            <img
              src={imageUrl}
              alt={imageName}
              className="mx-auto max-h-[70vh] max-w-full object-contain"
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 rounded-lg border border-border bg-muted/30 p-4 text-left">
            {imageName && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">File Name</div>
                <div className="mt-1 break-all text-sm">{imageName}</div>
              </div>
            )}
            {imageSize && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">File Size</div>
                <div className="mt-1 text-sm">{formatFileSize(imageSize)}</div>
              </div>
            )}
            {extractionData && (
              <>
                {typeof extractionData.confidence === 'number' && (
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      AI Confidence
                    </div>
                    <div
                      className="mt-1 text-sm"
                      style={{
                        color:
                          extractionData.confidence >= 80
                            ? '#52c41a'
                            : extractionData.confidence >= 60
                            ? '#faad14'
                            : '#ff4d4f',
                      }}
                    >
                      {extractionData.confidence}%
                    </div>
                  </div>
                )}
                {typeof extractionData.processingTime === 'number' && (
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      Processing Time
                    </div>
                    <div className="mt-1 text-sm">
                      {extractionData.processingTime < 1000
                        ? `${Math.round(extractionData.processingTime)}ms`
                        : `${(extractionData.processingTime / 1000).toFixed(1)}s`}
                    </div>
                  </div>
                )}
                {typeof extractionData.attributesFound === 'number' && (
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      Attributes Found
                    </div>
                    <div className="mt-1 text-sm text-primary">{extractionData.attributesFound}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Tooltip title="Download original image">
            <Button variant="outline" onClick={handleDownload}>
              <Download />
              Download
            </Button>
          </Tooltip>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
