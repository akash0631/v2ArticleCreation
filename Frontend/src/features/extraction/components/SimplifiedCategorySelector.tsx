/**
 * Simplified Category Selector
 * 
 * Only shows Department → Major Category selection
 * No sub-department step
 */

import { useState, useEffect, useMemo } from 'react';
import { Select, Card, Typography, Tag, Button } from 'antd';
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

export const SIMPLIFIED_HIERARCHY = {
  'Mens': ['MU', 'MS-U', 'MS-L', 'MW', 'MO', 'MS-IW', 'ML'],
  'Ladies': ['LU', 'LL', 'LK&L', 'LN&L', 'LW'],
  'Kids': ['KB-SETS', 'KB-L', 'KB-U', 'KBW-U', 'KBW-L', 'KBW-SETS', 'KG-L', 'KG-U', 'KGW-U', 'KGW-L', 'IB', 'IG', 'KI', 'KIW', 'KB', 'KBW', 'KG']
};

export interface SimplifiedCategory {
  department: string;
  majorCategory: string;
  displayName: string;
}

interface SimplifiedCategorySelectorProps {
  onCategorySelect: (category: SimplifiedCategory | null) => void;
  selectedCategory?: SimplifiedCategory | null;
}

const normalizeDivision = (division?: string): string | null => {
  if (!division) return null;
  const upper = division.toUpperCase();
  if (upper === 'MEN') return 'Mens';
  if (upper === 'KIDS') return 'Kids';
  if (upper === 'LADIES') return 'Ladies';
  return division;
};

const parseSubDivisions = (rawSubDivision: unknown): string[] => {
  if (Array.isArray(rawSubDivision)) {
    return rawSubDivision
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  if (typeof rawSubDivision === 'string') {
    return rawSubDivision
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
};

export const SimplifiedCategorySelector: React.FC<SimplifiedCategorySelectorProps> = ({
  onCategorySelect,
  selectedCategory
}) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>(
    selectedCategory?.department
  );
  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string | undefined>(
    selectedCategory?.majorCategory
  );

  const creatorScope = useMemo(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isCreator = user.role === 'CREATOR';
    const restrictedDivision = isCreator ? normalizeDivision(user.division) : null;
    const allowedSubDivisions = isCreator ? parseSubDivisions(user.subDivision) : [];

    return {
      isCreator,
      restrictedDivision,
      allowedSubDivisions,
      isSingleScopedCreator: isCreator && !!restrictedDivision && allowedSubDivisions.length === 1,
    };
  }, []);

  const departments = creatorScope.restrictedDivision
    ? [creatorScope.restrictedDivision]
    : Object.keys(SIMPLIFIED_HIERARCHY);
  const majorCategories = selectedDepartment
    ? (SIMPLIFIED_HIERARCHY[selectedDepartment as keyof typeof SIMPLIFIED_HIERARCHY] || []).filter((category) => {
      if (!creatorScope.isCreator) return true;
      if (creatorScope.allowedSubDivisions.length === 0) return true;
      return creatorScope.allowedSubDivisions.includes(category);
    })
    : [];

  useEffect(() => {
    if (creatorScope.restrictedDivision && !selectedDepartment) {
      setSelectedDepartment(creatorScope.restrictedDivision);
    }
  }, [creatorScope.restrictedDivision, selectedDepartment]);

  useEffect(() => {
    if (selectedDepartment && selectedMajorCategory) {
      onCategorySelect({
        department: selectedDepartment,
        majorCategory: selectedMajorCategory,
        displayName: `${selectedDepartment} - ${selectedMajorCategory}`
      });
    }
  }, [selectedDepartment, selectedMajorCategory, onCategorySelect]);

  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setSelectedMajorCategory(undefined); // Reset major category when department changes
    onCategorySelect(null); // Clear selection until both are selected
  };

  const handleMajorCategoryChange = (value: string) => {
    setSelectedMajorCategory(value);
  };

  const handleReset = () => {
    setSelectedDepartment(undefined);
    setSelectedMajorCategory(undefined);
    onCategorySelect(null);
  };

  // Show summary if both are selected
  if (selectedDepartment && selectedMajorCategory) {
    return (
      <Card className="category-summary" style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#FF6F61' }}>
              {selectedMajorCategory}
            </Title>
            <Text type="secondary">
              {selectedDepartment} → {selectedMajorCategory}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Tag color="blue" className="selection-badge">
                Sub-Division Selected
              </Tag>
            </div>
          </div>
          {!creatorScope.isSingleScopedCreator ? (
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReset}
              className="btn-secondary"
            >
              Change Sub-Division
            </Button>
          ) : (
            <Tag color="orange">Fixed Scope</Tag>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <span style={{ color: '#FF6F61', fontWeight: 600 }}>
          <InfoCircleOutlined style={{ marginRight: 8 }} />
          Select Category (Simplified)
        </span>
      }
      className="category-selector"
      style={{ borderRadius: 12 }}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Division Selection */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            1. Choose Division
          </Text>
          <Select
            placeholder="Select division (Kids, Ladies, Mens)"
            value={selectedDepartment}
            onChange={handleDepartmentChange}
            style={{ width: '100%' }}
            size="large"
            allowClear={!creatorScope.restrictedDivision}
            disabled={!!creatorScope.restrictedDivision}
          >
            {departments.map(dept => (
              <Option key={dept} value={dept}>
                {dept}
              </Option>
            ))}
          </Select>
        </div>

        {/* Sub-Division Selection */}
        {selectedDepartment && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              2. Choose Sub-Division
            </Text>
            <Select
              placeholder="Select sub-division (Tops, Bottoms, etc.)"
              value={selectedMajorCategory}
              onChange={handleMajorCategoryChange}
              style={{ width: '100%' }}
              size="large"
              allowClear
            >
              {majorCategories.map(cat => (
                <Option key={cat} value={cat}>
                  {cat}
                </Option>
              ))}
            </Select>
          </div>
        )}

        {selectedDepartment && !selectedMajorCategory && (
          <div style={{
            padding: '12px',
            background: '#e6f7ff',
            borderRadius: 8,
            border: '1px solid #91d5ff'
          }}>
            <Text type="secondary">
              ℹ️ Select a major category to proceed
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
};
