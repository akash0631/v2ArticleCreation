import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Tag, Tooltip } from '@/shared/components/ui-tw';
import type { ExtractedRow } from '../../../types/extraction/ExtractionTypes';

interface StatusBadgeProps {
  status: ExtractedRow['status'];
  showText?: boolean;
  size?: 'small' | 'default';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showText = true,
  size = 'default',
}) => {
  const getStatusConfig = (s: ExtractedRow['status']) => {
    switch (s) {
      case 'Done':
        return {
          color: '#020301ff',
          backgroundColor: '#77d11d',
          borderColor: '#020301ff',
          icon: <CheckCircle2 className="h-3 w-3" />,
          text: 'Completed',
          tooltip: 'AI extraction completed successfully',
        };
      case 'Pending':
        return {
          color: '#070809ff',
          backgroundColor: '#3597d3',
          borderColor: '#070809ff',
          icon: <Clock className="h-3 w-3" />,
          text: 'Pending',
          tooltip: 'Waiting for AI analysis',
        };
      case 'Error':
        return {
          color: '#ffffff',
          backgroundColor: '#f0381b',
          borderColor: '#ffadd2',
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
          tooltip: 'AI extraction failed - retry available',
        };
      case 'Extracting':
        return {
          color: '#070809',
          backgroundColor: '#cfb019',
          borderColor: '#ffe58f',
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Processing',
          tooltip: 'AI is analyzing the image...',
        };
      default:
        return {
          color: '#ffffff',
          backgroundColor: '#989393',
          borderColor: '#d9d9d9',
          icon: <Clock className="h-3 w-3" />,
          text: 'Unknown',
          tooltip: 'Status unknown',
        };
    }
  };

  const config = getStatusConfig(status);

  if (!showText) {
    return (
      <Tooltip title={config.tooltip}>
        <span
          className="inline-block rounded-full"
          style={{
            width: size === 'small' ? 8 : 10,
            height: size === 'small' ? 8 : 10,
            backgroundColor: config.backgroundColor,
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={config.tooltip}>
      <Tag
        color={config.color}
        bgColor={config.backgroundColor}
        borderColor={config.borderColor}
        icon={config.icon}
        style={{
          fontSize: size === 'small' ? 11 : 12,
          padding: size === 'small' ? '2px 6px' : '4px 8px',
          borderRadius: 4,
          fontWeight: 500,
        }}
      >
        {config.text}
      </Tag>
    </Tooltip>
  );
};
