/**
 * Simplified Category Selector — DB-driven
 * Fetches departments and categories from the hierarchy API.
 * Falls back to hardcoded data if the API is unavailable.
 */

import { useState, useEffect, useMemo } from 'react';
import { Select, Card, Typography, Tag, Button, Spin } from 'antd';
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { APP_CONFIG } from '../../../config/app.config';

const { Title, Text } = Typography;
const { Option } = Select;

// Hardcoded fallback (used if API is empty / unreachable)
export const SIMPLIFIED_HIERARCHY: Record<string, string[]> = {
  'Kids':   ['KB-SETS', 'KB-L', 'KB-U', 'KBW-U', 'KBW-L', 'KBW-SETS', 'KG-L', 'KG-U', 'KGW-U', 'KGW-L', 'IB', 'IG', 'KI', 'KIW', 'KB', 'KBW', 'KG'],
  'Ladies': ['LU', 'LL', 'LK&L', 'LN&L', 'LW'],
  'MENS':   ['MU', 'MS-U', 'MS-L', 'MW', 'MO', 'MS-IW', 'ML'],
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
  if (upper === 'MEN' || upper === 'MENS') return 'MENS';
  if (upper === 'KIDS') return 'Kids';
  if (upper === 'LADIES') return 'Ladies';
  return division;
};

const parseSubDivisions = (rawSubDivision: unknown): string[] => {
  if (Array.isArray(rawSubDivision)) return rawSubDivision.map(v => String(v).trim()).filter(Boolean);
  if (typeof rawSubDivision === 'string') return rawSubDivision.split(',').map(v => v.trim()).filter(Boolean);
  return [];
};

export const SimplifiedCategorySelector: React.FC<SimplifiedCategorySelectorProps> = ({
  onCategorySelect,
  selectedCategory,
}) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>(selectedCategory?.department);
  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string | undefined>(selectedCategory?.majorCategory);

  // DB-driven hierarchy (falls back to hardcoded)
  const [hierarchy, setHierarchy] = useState<Record<string, string[]>>(SIMPLIFIED_HIERARCHY);
  const [hierarchyLoading, setHierarchyLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    fetch(`${APP_CONFIG.api.baseURL}/user/hierarchy`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.data?.departments?.length) return;
        const map: Record<string, string[]> = {};
        for (const dept of data.data.departments) {
          if (dept.categories?.length) {
            map[dept.name] = dept.categories.map((c: any) => c.code);
          }
        }
        if (Object.keys(map).length) setHierarchy(map);
      })
      .catch(() => {/* keep fallback */})
      .finally(() => setHierarchyLoading(false));
  }, []);

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
    : Object.keys(hierarchy);

  const majorCategories = selectedDepartment
    ? (hierarchy[selectedDepartment] || []).filter(cat => {
        if (!creatorScope.isCreator) return true;
        if (creatorScope.allowedSubDivisions.length === 0) return true;
        return creatorScope.allowedSubDivisions.includes(cat);
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
        displayName: `${selectedDepartment} - ${selectedMajorCategory}`,
      });
    }
  }, [selectedDepartment, selectedMajorCategory, onCategorySelect]);

  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setSelectedMajorCategory(undefined);
    onCategorySelect(null);
  };

  const handleReset = () => {
    setSelectedDepartment(undefined);
    setSelectedMajorCategory(undefined);
    onCategorySelect(null);
  };

  if (selectedDepartment && selectedMajorCategory) {
    return (
      <Card className="category-summary" style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#FF6F61' }}>
              {selectedMajorCategory}
            </Title>
            <Text type="secondary">{selectedDepartment} → {selectedMajorCategory}</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color="blue" className="selection-badge">Sub-Division Selected</Tag>
            </div>
          </div>
          {!creatorScope.isSingleScopedCreator ? (
            <Button icon={<ReloadOutlined />} onClick={handleReset} className="btn-secondary">
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
      <Spin spinning={hierarchyLoading} tip="Loading categories...">
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>1. Choose Division</Text>
            <Select
              placeholder="Select division (Kids, Ladies, MENS)"
              value={selectedDepartment}
              onChange={handleDepartmentChange}
              style={{ width: '100%' }}
              size="large"
              allowClear={!creatorScope.restrictedDivision}
              disabled={!!creatorScope.restrictedDivision || hierarchyLoading}
            >
              {departments.map(dept => (
                <Option key={dept} value={dept}>{dept}</Option>
              ))}
            </Select>
          </div>

          {selectedDepartment && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>2. Choose Sub-Division</Text>
              <Select
                placeholder="Select sub-division (Tops, Bottoms, etc.)"
                value={selectedMajorCategory}
                onChange={setSelectedMajorCategory}
                style={{ width: '100%' }}
                size="large"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {majorCategories.map(cat => (
                  <Option key={cat} value={cat}>{cat}</Option>
                ))}
              </Select>
            </div>
          )}

          {selectedDepartment && !selectedMajorCategory && (
            <div style={{ padding: 12, background: '#e6f7ff', borderRadius: 8, border: '1px solid #91d5ff' }}>
              <Text type="secondary">ℹ️ Select a major category to proceed</Text>
            </div>
          )}
        </div>
      </Spin>
    </Card>
  );
};
