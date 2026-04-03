import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Select,
  Input,
  Badge,
  Button,
  Popover,
  Space,
  Tag,
  Typography
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  RobotOutlined
} from '@ant-design/icons';
import type { AttributeDetail, SchemaItem } from '../../../shared/types/extraction/ExtractionTypes';
import { submitCorrection } from '../../../services/feedbackService';

const { Text } = Typography;
const { Option } = Select;

interface AttributeCellProps {
  attribute?: AttributeDetail | null;
  schemaItem: SchemaItem;
  onChange: (value: string | number | null, aiPredicted?: string) => void;
  onAddToSchema?: (value: string) => void;
  disabled?: boolean;
  // Navigation: called after Enter-save so parent can focus next cell
  onSaveAndNext?: () => void;
  // When true, this cell should auto-enter edit mode
  autoFocus?: boolean;
  // Called once after auto-focus is consumed so parent can reset its state
  onAutoFocused?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const persistNewValueToBackend = async (attributeKey: string, value: string) => {
  try {
    const token = localStorage.getItem('authToken');
    await fetch(`${API_BASE_URL}/user/attributes/by-key/${encodeURIComponent(attributeKey)}/values`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ shortForm: value, fullForm: value })
    });
  } catch {
    // Non-critical
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
  const [selectSearch, setSelectSearch] = useState('');
  const inputRef = useRef<any>(null);
  // Track whether save was triggered by Enter (for navigation)
  const savedByEnterRef = useRef(false);

  useEffect(() => {
    if (schemaItem.key === 'fab_yarn-01' || schemaItem.key === 'fab_yarn-02' || schemaItem.key === 'fab_weave-02') {
      console.log(`[AttributeCell] ${schemaItem.key}:`, {
        hasAttribute: !!attribute,
        attribute,
        schemaValue: attribute?.schemaValue,
        rawValue: attribute?.rawValue
      });
    }
  }, [attribute, schemaItem.key]);

  useEffect(() => {
    setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
  }, [attribute?.schemaValue, attribute?.rawValue]);

  // Auto-focus: enter edit mode when parent requests it
  useEffect(() => {
    if (autoFocus && !disabled) {
      setIsEditing(true);
      setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
      onAutoFocused?.();
    }
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the input element when editing starts
  useEffect(() => {
    if (isEditing && schemaItem.type === 'text') {
      // Small delay to let the DOM render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditing, schemaItem.type]);

  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
  }, [disabled, attribute?.schemaValue, attribute?.rawValue]);

  const handleSaveEdit = useCallback((triggeredByEnter = false) => {
    const effectiveValue = (schemaItem.type === 'select' && selectSearch.trim())
      ? selectSearch.trim()
      : editValue;
    if (effectiveValue !== editValue) {
      setEditValue(effectiveValue);
    }

    const aiPredictedValue = attribute?.schemaValue;
    const isCorrection = aiPredictedValue && effectiveValue !== aiPredictedValue;

    if (isCorrection) {
      submitCorrection({
        attributeKey: schemaItem.key,
        aiPredicted: String(aiPredictedValue),
        userCorrected: String(effectiveValue),
        timestamp: new Date().toISOString()
      }).catch((err) => {
        console.warn('⚠️ Failed to log correction (non-critical):', err);
      });
    }

    onChange(effectiveValue, isCorrection ? String(aiPredictedValue) : undefined);
    setIsEditing(false);
    setSelectSearch('');
    savedByEnterRef.current = triggeredByEnter;

    if (
      effectiveValue !== null &&
      effectiveValue !== undefined &&
      effectiveValue !== '' &&
      schemaItem.type === 'select' &&
      schemaItem.allowedValues &&
      schemaItem.allowedValues.length > 0
    ) {
      const strVal = String(effectiveValue).trim().toLowerCase();
      const exists = schemaItem.allowedValues.some(
        v => (v.shortForm || '').toLowerCase() === strVal || (v.fullForm || '').toLowerCase() === strVal
      );
      if (!exists) {
        onAddToSchema?.(String(effectiveValue).trim());
        persistNewValueToBackend(schemaItem.key, String(effectiveValue).trim());
      }
    }

    if (triggeredByEnter) {
      onSaveAndNext?.();
    }
  }, [editValue, onChange, onAddToSchema, attribute?.schemaValue, schemaItem, selectSearch, onSaveAndNext]);

  const handleCancelEdit = useCallback(() => {
    setEditValue(attribute?.schemaValue ?? attribute?.rawValue ?? null);
    setIsEditing(false);
    setSelectSearch('');
  }, [attribute?.schemaValue, attribute?.rawValue]);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return '#52c41a';
    if (confidence >= 60) return '#faad14';
    if (confidence >= 40) return '#fa8c16';
    return '#f5222d';
  };

  const renderDisplayValue = () => {
    const schemaValue = attribute?.schemaValue;
    const rawValue = attribute?.rawValue;

    if (schemaValue !== null && schemaValue !== undefined && schemaValue !== '') {
      return (
        <Text strong style={{ fontSize: 12 }}>
          {String(schemaValue)}
        </Text>
      );
    }

    if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
      return (
        <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
          {String(rawValue)}
        </Text>
      );
    }

    return (
      <Text type="secondary" style={{ fontStyle: 'italic' }}>
        No value
      </Text>
    );
  };

  const renderEditInput = () => (
    schemaItem.type === 'text' ? (
      <Input
        ref={inputRef}
        value={editValue as string}
        onChange={(e) => setEditValue(e.target.value)}
        onPressEnter={() => handleSaveEdit(true)}
        style={{ width: '100%', minWidth: 120 }}
        size="small"
        placeholder="Type value"
      />
    ) : (
      <Select
        value={editValue as string}
        onChange={(val) => {
          setEditValue(val);
          setSelectSearch('');
        }}
        onSearch={setSelectSearch}
        style={{ width: '100%', minWidth: 120 }}
        size="small"
        showSearch
        allowClear
        autoFocus
        placeholder="Select or type value"
        filterOption={(input, option) =>
          option?.value === '__custom__' ||
          (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
        }
        onSelect={() => {
          // Small delay so value is set before save
          setTimeout(() => handleSaveEdit(true), 50);
        }}
        popupRender={menu => (
          <div>
            {menu}
            {selectSearch.trim() && (
              <div
                style={{ padding: '6px 12px', borderTop: '1px solid #f0f0f0', cursor: 'pointer', color: '#1677ff', fontSize: 12 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setEditValue(selectSearch.trim());
                  setSelectSearch('');
                }}
              >
                + Add "{selectSearch.trim()}" as new value
              </div>
            )}
          </div>
        )}
      >
        {schemaItem.allowedValues?.map((valObj) => {
          const value = valObj.shortForm || valObj.fullForm || '';
          const label = valObj.fullForm
            ? `${valObj.fullForm}${valObj.shortForm ? ` (${valObj.shortForm})` : ''}`
            : (valObj.shortForm || '');
          return (
            <Option key={value} value={value} label={label}>
              {label}
            </Option>
          );
        })}
      </Select>
    )
  );

  const reasoningContent = (
    <div style={{ maxWidth: 250 }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 12 }}>AI Reasoning:</Text>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          {attribute?.reasoning || 'No reasoning provided'}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 12 }}>Raw Value:</Text>
        <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>
          {attribute?.rawValue || 'null'}
        </div>
      </div>

      <Space size="small">
        <Tag color="blue" style={{ fontSize: 10 }}>
          Visual: {attribute?.visualConfidence || 0}%
        </Tag>
        <Tag color="green" style={{ fontSize: 10 }}>
          Mapping: {attribute?.mappingConfidence || 0}%
        </Tag>
      </Space>

      {attribute?.isNewDiscovery && (
        <Tag icon={<RobotOutlined />} color="purple" style={{ fontSize: '11px', marginTop: 8 }}>
          New Discovery
        </Tag>
      )}
    </div>
  );

  if (isEditing) {
    return (
      <Space.Compact style={{ width: '100%' }}>
        {renderEditInput()}
        <Button
          type="text"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handleSaveEdit(false)}
          style={{ color: '#52c41a' }}
        />
        <Button
          type="text"
          icon={<CloseOutlined />}
          size="small"
          onClick={handleCancelEdit}
          style={{ color: '#f5222d' }}
        />
      </Space.Compact>
    );
  }

  const isUserEdited = attribute?.isUserEdited === true;

  return (
    <div
      className="attribute-cell"
      style={{
        padding: 8,
        minHeight: 50,
        backgroundColor: isUserEdited ? '#f6ffed' : attribute?.schemaValue ? '#fafafa' : '#f8f9fa',
        border: `1px solid ${isUserEdited ? '#b7eb8f' : '#e8e8e8'}`,
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
      onClick={handleStartEdit}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = '#f0f0f0';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isUserEdited ? '#f6ffed' : attribute?.schemaValue ? '#fafafa' : '#f8f9fa';
      }}
    >
      <div style={{ flex: 1 }}>
        {renderDisplayValue()}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4
      }}>
        {isUserEdited && (
          <Tag color="green" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', height: 14, margin: 0 }}>
            Updated
          </Tag>
        )}

        {!isUserEdited && attribute?.rawValue && (
          <RobotOutlined style={{ fontSize: 10, color: '#FF6F61' }} />
        )}

        {attribute?.reasoning && (
          <Popover
            content={reasoningContent}
            title="AI Analysis"
            trigger="hover"
          >
            <Button
              type="text"
              icon={<InfoCircleOutlined />}
              style={{
                fontSize: 11,
                color: '#8c8c8c',
                minWidth: 16,
                height: 16,
                padding: 0,
                cursor: 'help'
              }}
            />
          </Popover>
        )}

        {attribute && attribute.visualConfidence > 0 && !isUserEdited && (
          <Badge
            count={`${attribute.visualConfidence}%`}
            style={{
              backgroundColor: getConfidenceColor(attribute.visualConfidence),
              fontSize: 9,
              height: 14,
              minWidth: 24
            }}
          />
        )}
      </div>
    </div>
  );
};
