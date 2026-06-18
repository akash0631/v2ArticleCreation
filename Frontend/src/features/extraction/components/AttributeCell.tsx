import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Check, X, Info, Bot } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tag,
} from '@/shared/components/ui-tw';
import { cn } from '@/lib/utils';
import type { AttributeDetail, SchemaItem } from '../../../shared/types/extraction/ExtractionTypes';
import { submitCorrection } from '../../../services/feedbackService';

interface AttributeCellProps {
  attribute?: AttributeDetail | null;
  schemaItem: SchemaItem;
  onChange: (value: string | number | null, aiPredicted?: string) => void;
  onAddToSchema?: (value: string) => void;
  disabled?: boolean;
  onSaveAndNext?: () => void;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');

const normalizeText = (value: string | number | null | undefined): string => String(value ?? '').trim();

const persistNewValueToBackend = async (attributeKey: string, value: string) => {
  try {
    const token = localStorage.getItem('authToken');
    await fetch(`${API_BASE_URL}/user/attributes/by-key/${encodeURIComponent(attributeKey)}/values`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ shortForm: value, fullForm: value }),
    });
  } catch {
    /* non-critical */
  }
};

export const AttributeCell: React.FC<AttributeCellProps> = ({
  attribute,
  schemaItem,
  onChange,
  onAddToSchema,
  disabled = false,
  onSaveAndNext,
  autoFocus,
  onAutoFocused,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string | number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizeSelectValue = useCallback(
    (value: string | number | null | undefined) => {
      const candidate = normalizeText(value);
      if (!candidate || schemaItem.type !== 'select' || !schemaItem.allowedValues?.length) return candidate;
      const lowerCandidate = candidate.toLowerCase();
      const exactShort = schemaItem.allowedValues.find(
        (item) => normalizeText(item.shortForm).toLowerCase() === lowerCandidate,
      );
      if (exactShort?.shortForm) return exactShort.shortForm;
      const exactFull = schemaItem.allowedValues.find(
        (item) => normalizeText(item.fullForm || item.shortForm).toLowerCase() === lowerCandidate,
      );
      if (exactFull?.shortForm) return exactFull.shortForm;
      return candidate;
    },
    [schemaItem.allowedValues, schemaItem.type],
  );

  const getDisplayValue = useCallback(
    (value: string | number | null | undefined) => {
      const candidate = normalizeText(value);
      if (!candidate) return '';
      if (schemaItem.type !== 'select' || !schemaItem.allowedValues?.length) return candidate;
      return normalizeSelectValue(candidate);
    },
    [normalizeSelectValue, schemaItem.allowedValues, schemaItem.type],
  );

  useEffect(() => {
    setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
  }, [attribute?.schemaValue, attribute?.rawValue]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      setIsEditing(true);
      setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
      onAutoFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  useEffect(() => {
    if (isEditing && schemaItem.type === 'text') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditing, schemaItem.type]);

  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
  }, [disabled, attribute?.schemaValue, attribute?.rawValue]);

  const handleSaveEdit = useCallback(
    (triggeredByEnter = false, explicitValue?: string | number | null) => {
      const baseValue = explicitValue !== undefined ? explicitValue : editValue;
      const normalizedEffectiveValue =
        schemaItem.type === 'select' ? normalizeSelectValue(baseValue) : baseValue;

      if (normalizedEffectiveValue !== editValue) setEditValue(normalizedEffectiveValue);

      const aiPredictedValue =
        schemaItem.type === 'select' ? normalizeSelectValue(attribute?.schemaValue) : attribute?.schemaValue;
      const isCorrection = aiPredictedValue && normalizedEffectiveValue !== aiPredictedValue;

      if (isCorrection) {
        submitCorrection({
          attributeKey: schemaItem.key,
          aiPredicted: String(aiPredictedValue),
          userCorrected: String(normalizedEffectiveValue),
          timestamp: new Date().toISOString(),
        }).catch((err) => console.warn('Failed to log correction (non-critical):', err));
      }

      onChange(normalizedEffectiveValue, isCorrection ? String(aiPredictedValue) : undefined);
      setIsEditing(false);

      if (
        normalizedEffectiveValue !== null &&
        normalizedEffectiveValue !== undefined &&
        normalizedEffectiveValue !== '' &&
        schemaItem.type === 'select' &&
        schemaItem.allowedValues &&
        schemaItem.allowedValues.length > 0
      ) {
        const strVal = String(normalizedEffectiveValue).trim().toLowerCase();
        const exists = schemaItem.allowedValues.some(
          (v) => (v.shortForm || '').toLowerCase() === strVal || (v.fullForm || '').toLowerCase() === strVal,
        );
        if (!exists) {
          onAddToSchema?.(String(normalizedEffectiveValue).trim());
          persistNewValueToBackend(schemaItem.key, String(normalizedEffectiveValue).trim());
        }
      }

      if (triggeredByEnter) onSaveAndNext?.();
    },
    [editValue, onChange, onAddToSchema, attribute?.schemaValue, schemaItem, onSaveAndNext, normalizeSelectValue],
  );

  const handleCancelEdit = useCallback(() => {
    setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
    setIsEditing(false);
  }, [attribute?.schemaValue, attribute?.rawValue]);

  const confidencePillColor = (c: number) =>
    c >= 80 ? '#52c41a' : c >= 60 ? '#faad14' : c >= 40 ? '#fa8c16' : '#f5222d';

  const renderDisplayValue = () => {
    const schemaValue = attribute?.schemaValue;
    const rawValue = attribute?.rawValue;

    if (schemaValue !== null && schemaValue !== undefined && schemaValue !== '') {
      return <strong className="text-xs">{getDisplayValue(schemaValue)}</strong>;
    }
    if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
      return <span className="text-xs italic text-muted-foreground">{getDisplayValue(rawValue)}</span>;
    }
    return <span className="text-xs italic text-muted-foreground">No value</span>;
  };

  const renderEditInput = () =>
    schemaItem.type === 'text' ? (
      <Input
        ref={inputRef}
        value={(editValue as string) ?? ''}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(true)}
        className="h-8 w-full min-w-[120px] text-xs"
        placeholder="Type value"
      />
    ) : (
      <Select
        value={normalizeText(editValue) || undefined}
        onValueChange={(val) => {
          setEditValue(val);
          handleSaveEdit(true, val);
        }}
      >
        <SelectTrigger className="h-8 w-full min-w-[120px] text-xs">
          <SelectValue placeholder="Select value" />
        </SelectTrigger>
        <SelectContent>
          {schemaItem.allowedValues?.map((valObj) => {
            const value = valObj.shortForm || valObj.fullForm || '';
            return (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );

  const reasoningContent = (
    <div className="max-w-[250px]">
      <div className="mb-2">
        <strong className="text-xs">AI Reasoning:</strong>
        <div className="mt-1 text-[11px]">{attribute?.reasoning || 'No reasoning provided'}</div>
      </div>
      <div className="mb-2">
        <strong className="text-xs">Raw Value:</strong>
        <div className="mt-1 font-mono text-[11px]">{attribute?.rawValue || 'null'}</div>
      </div>
      <div className="flex gap-1">
        <Tag className="bg-sky-50 text-sky-800 text-[10px]">
          Visual: {attribute?.visualConfidence || 0}%
        </Tag>
        <Tag className="bg-emerald-50 text-emerald-800 text-[10px]">
          Mapping: {attribute?.mappingConfidence || 0}%
        </Tag>
      </div>
      {attribute?.isNewDiscovery && (
        <Tag className="mt-2 bg-purple-50 text-purple-800 text-[11px]">
          <Bot className="h-3 w-3" />
          New Discovery
        </Tag>
      )}
    </div>
  );

  if (isEditing) {
    return (
      <div className="flex w-full items-center gap-0.5">
        {renderEditInput()}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleSaveEdit(false)}>
          <Check />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={handleCancelEdit}>
          <X />
        </Button>
      </div>
    );
  }

  const isUserEdited = attribute?.isUserEdited === true;

  return (
    <div
      className={cn(
        'attribute-cell relative flex min-h-[50px] flex-col justify-between rounded border p-2 transition-colors',
        disabled ? 'cursor-default' : 'cursor-pointer hover:bg-muted/60',
        isUserEdited ? 'border-emerald-200 bg-emerald-50' : attribute?.schemaValue ? 'bg-muted/30' : 'bg-muted/20',
      )}
      onClick={handleStartEdit}
    >
      <div className="flex-1">{renderDisplayValue()}</div>

      <div className="mt-1 flex items-center justify-between">
        {isUserEdited && (
          <Tag className="m-0 h-3.5 bg-emerald-100 px-1 py-0 text-[9px] leading-[14px] text-emerald-800">
            Updated
          </Tag>
        )}

        {!isUserEdited && attribute?.rawValue && <Bot className="h-2.5 w-2.5 text-primary" />}

        {attribute?.reasoning && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 cursor-help text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Info />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto">
              <div className="mb-2 text-xs font-semibold">AI Analysis</div>
              {reasoningContent}
            </PopoverContent>
          </Popover>
        )}

        {attribute && attribute.visualConfidence > 0 && !isUserEdited && (
          <Badge
            className="h-3.5 min-w-[24px] text-[9px]"
            style={{ background: confidencePillColor(attribute.visualConfidence) }}
          >
            {attribute.visualConfidence}%
          </Badge>
        )}
      </div>
    </div>
  );
};
