/**
 * Simplified Category Selector
 * 
 * Only shows Department → Major Category selection
 * No sub-department step
 */

import { useState, useEffect } from 'react';
import { Select, Card, Typography, Tag, Button } from 'antd';
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

export const SIMPLIFIED_HIERARCHY = {
  'Kids': ['KB-L', 'KG-L', 'KB-SETS', 'KB-U', 'KG-U', 'IB', 'IG'],
  'Ladies': ['LK&L', 'LL', 'LU', 'LN&L'],
  'Mens': ['ML', 'MU', 'MS-L', 'MS-U', 'MS-IW']
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

  const departments = Object.keys(SIMPLIFIED_HIERARCHY);
  const majorCategories = selectedDepartment
    ? SIMPLIFIED_HIERARCHY[selectedDepartment as keyof typeof SIMPLIFIED_HIERARCHY] || []
    : [];

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
          {!localStorage.getItem('user') || JSON.parse(localStorage.getItem('user') || '{}').role !== 'CREATOR' || !JSON.parse(localStorage.getItem('user') || '{}').division ? (
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
            allowClear
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
