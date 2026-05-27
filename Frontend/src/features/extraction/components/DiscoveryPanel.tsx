/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { FlaskConical, Plus, Lightbulb, Trophy } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Statistic,
  Tag,
  Tooltip,
} from "@/shared/components/ui-tw";
import type { DiscoveredAttribute } from "../../../shared/types/extraction/ExtractionTypes";

interface DiscoveryPanelProps {
  discoveries: DiscoveredAttribute[];
  onPromoteToSchema: (discoveryKey: string) => void;
  onViewDetails: (discovery: DiscoveredAttribute) => void;
}

export const DiscoveryPanel: React.FC<DiscoveryPanelProps> = ({
  discoveries,
  onPromoteToSchema,
  onViewDetails,
}) => {
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const highConfidence = discoveries.filter((d) => d.confidence >= 80);
  const promotable = discoveries.filter((d) => d.frequency >= 3 && d.confidence >= 75);

  if (discoveries.length === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-purple-600" />
          AI Discoveries
          <Badge className="bg-purple-600">{discoveries.length}</Badge>
        </CardTitle>
        <div className="flex items-center gap-4">
          <Statistic title="High Confidence" value={`${highConfidence.length}/${discoveries.length}`} />
          <Statistic title="Promotable" value={promotable.length} />
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible value={activeKeys[0]} onValueChange={(v) => setActiveKeys(v ? [v] : [])}>
          <AccordionItem value="discoveries">
            <AccordionTrigger className="hover:no-underline">
              <span className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                New Attributes Found
                <Badge variant="secondary">{discoveries.length}</Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2">
                {discoveries.map((discovery) => (
                  <Card
                    key={discovery.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => onViewDetails(discovery)}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                  >
                    <CardContent className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{discovery.label}</strong>
                        <code className="rounded bg-muted px-1 text-xs">{discovery.normalizedValue}</code>
                        <Badge style={{ background: discovery.confidence >= 80 ? "#52c41a" : "#faad14" }}>
                          {discovery.confidence}%
                        </Badge>
                        {discovery.frequency > 1 && <Badge variant="info">×{discovery.frequency}</Badge>}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          {discovery.reasoning.substring(0, 100)}...
                        </span>
                        {discovery.frequency >= 3 && discovery.confidence >= 75 && (
                          <Tooltip title="Add to schema for future extractions">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-emerald-600"
                              aria-label={`Promote ${discovery.label} to schema`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onPromoteToSchema(discovery.key);
                              }}
                            >
                              <Plus />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {promotable.length > 0 && (
            <AccordionItem value="promotable">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-500" />
                  Ready for Schema
                  <Badge className="bg-emerald-500">{promotable.length}</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-1">
                  {promotable.map((discovery) => (
                    <Tag
                      key={discovery.key}
                      className="cursor-pointer bg-emerald-50 text-emerald-700"
                      onClick={() => onPromoteToSchema(discovery.key)}
                    >
                      <Plus className="h-3 w-3" /> {discovery.label}
                    </Tag>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
};
