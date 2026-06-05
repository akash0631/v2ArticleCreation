import React from 'react';
import { Plus, Info, FlaskConical, Trophy } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Descriptions,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  Tag,
} from '@/shared/components/ui-tw';
import type { DiscoveredAttribute } from '../../../shared/types/extraction/ExtractionTypes';

interface DiscoveryDetailModalProps {
  discovery: DiscoveredAttribute | null;
  visible: boolean;
  onClose: () => void;
  onPromote: (discoveryKey: string) => void;
}

export const DiscoveryDetailModal: React.FC<DiscoveryDetailModalProps> = ({
  discovery,
  visible,
  onClose,
  onPromote,
}) => {
  if (!discovery) return null;

  const getConfidenceBar = (c: number) =>
    c >= 80 ? 'bg-emerald-500' : c >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const getConfidenceStatus = (c: number) => (c >= 80 ? 'High' : c >= 60 ? 'Medium' : 'Low');

  const isPromotable = discovery.frequency >= 2 && discovery.confidence >= 75;

  return (
    <Dialog open={visible} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-purple-600" />
            <span>Discovery Details</span>
            {isPromotable && (
              <Badge variant="success" className="gap-1">
                <Trophy className="h-3 w-3" />
                Ready for Schema
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Main Info */}
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Attribute Name">
              <strong className="text-base text-purple-600">{discovery.label}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Technical Key">
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{discovery.key}</code>
            </Descriptions.Item>
            <Descriptions.Item label="Current Value">
              <strong className="text-primary">{discovery.normalizedValue}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Raw AI Output">
              <span className="italic text-muted-foreground">{discovery.rawValue}</span>
            </Descriptions.Item>
          </Descriptions>

          {/* Confidence & Quality */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">AI Analysis Quality</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <strong>AI Confidence:</strong>
                <Progress
                  value={discovery.confidence}
                  indicatorClassName={getConfidenceBar(discovery.confidence)}
                  className="inline-block w-[200px]"
                />
                <span>
                  {discovery.confidence}% ({getConfidenceStatus(discovery.confidence)})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <strong>Times Observed:</strong>
                <Badge variant={discovery.frequency > 1 ? 'default' : 'secondary'}>
                  {discovery.frequency}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <strong>Suggested Type:</strong>
                <Badge variant="info" className="uppercase">
                  {discovery.suggestedType.toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* AI Reasoning */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">AI Reasoning</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-[13px]">
                <Info className="mr-2 inline h-4 w-4 text-primary" />
                <strong>Why AI identified this attribute:</strong>
              </p>
              <p className="mt-2 rounded-md bg-muted/40 p-3 text-[13px] italic">
                {discovery.reasoning}
              </p>
            </CardContent>
          </Card>

          {/* Possible Values */}
          {discovery.possibleValues && discovery.possibleValues.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Observed Values</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">
                  Values AI has observed for this attribute:
                </p>
                <div className="flex flex-wrap gap-1">
                  {discovery.possibleValues.map((value, index) => (
                    <Tag key={index} className="bg-sky-50 text-sky-800">
                      {value}
                    </Tag>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Promotion Info */}
          <Card
            className={
              isPromotable ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
            }
          >
            <CardContent className="pt-6">
              {isPromotable ? (
                <>
                  <div className="mb-1 flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-emerald-600" />
                    <strong className="text-emerald-700">Ready for Schema Promotion</strong>
                  </div>
                  <p className="m-0 text-[13px]">
                    This discovery has high confidence ({discovery.confidence}%) and has been observed{' '}
                    {discovery.frequency} times. Adding it to your schema will automatically extract this attribute in future analyses.
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-1 flex items-center gap-2">
                    <Info className="h-4 w-4 text-amber-600" />
                    <strong className="text-amber-700">Not Yet Promotable</strong>
                  </div>
                  <p className="m-0 text-[13px]">
                    {discovery.frequency < 2
                      ? `Needs to be observed more times (currently: ${discovery.frequency}, needs: 2+)`
                      : `Needs higher confidence (currently: ${discovery.confidence}%, needs: 75%+)`}{' '}
                    to be eligible for schema promotion.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {isPromotable && (
            <Button
              onClick={() => {
                onPromote(discovery.key);
                onClose();
              }}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              <Plus />
              Add to Schema
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
