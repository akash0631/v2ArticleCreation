/**
 * Simplified Category Selector — DB-driven
 * Fetches departments and categories from the hierarchy API.
 * Falls back to hardcoded data if the API is unavailable.
 *
 * Always shows Division + Sub-Division dropdowns so the user can see and
 * change them at any time. A "Continue to Upload →" button appears once both
 * are chosen and the user must click it explicitly to proceed.
 */

import { useState, useEffect, useMemo } from 'react';
import { Select, Typography, Button, Spin, Divider } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { APP_CONFIG } from '../../../constants/app/config';

const { Text } = Typography;
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
        const apiMap: Record<string, string[]> = {};
        for (const dept of data.data.departments) {
          if (!dept.categories?.length) continue;
          const key = normalizeDivision(dept.name) || dept.name;
          // Each category entry carries `subDepartmentCode` (e.g. "MU", "MW", "LU")
          // which is the actual sub-division code from the SubDepartment table.
          // Using c.code would give major-category codes (e.g. "MW_LW_JKT_FS") — wrong.
          const incoming = [...new Set(
            (dept.categories as any[])
              .map((c: any) => String(c.subDepartmentCode ?? '').trim())
              .filter(Boolean)
          )];
          if (incoming.length === 0) continue;
          const existing = apiMap[key] || [];
          apiMap[key] = [...new Set([...existing, ...incoming])];
        }
        // Always merge API result with hardcoded fallback
        const merged: Record<string, string[]> = { ...SIMPLIFIED_HIERARCHY };
        for (const [key, codes] of Object.entries(apiMap)) {
          merged[key] = [...new Set([...(SIMPLIFIED_HIERARCHY[key] || []), ...codes])];
        }
        setHierarchy(merged);
      })
      .catch(() => {/* keep fallback */})
      .finally(() => setHierarchyLoading(false));
  }, []);

  // Pre-fill division from user profile if not yet chosen
  const creatorScope = useMemo(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isCreator = user.role === 'CREATOR';
    const defaultDivision = normalizeDivision(user.division) ?? null;
    const allowedSubDivisions = parseSubDivisions(user.subDivision);
    return { isCreator, defaultDivision, allowedSubDivisions };
  }, []);

  useEffect(() => {
    if (creatorScope.defaultDivision && !selectedDepartment) {
      setSelectedDepartment(creatorScope.defaultDivision);
    }
  }, [creatorScope.defaultDivision, selectedDepartment]);

  const departments = Object.keys(hierarchy);

  const majorCategories = selectedDepartment
    ? (hierarchy[selectedDepartment] || [])
    : [];

  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setSelectedMajorCategory(undefined);
    onCategorySelect(null); // clear parent selection when division changes
  };

  const handleMajorCategoryChange = (value: string) => {
    setSelectedMajorCategory(value);
    onCategorySelect(null); // clear parent selection until user clicks Continue
  };

  const handleContinue = () => {
    if (!selectedDepartment || !selectedMajorCategory) return;
    onCategorySelect({
      department: selectedDepartment,
      majorCategory: selectedMajorCategory,
      displayName: `${selectedDepartment} - ${selectedMajorCategory}`,
    });
  };

  const canContinue = !!selectedDepartment && !!selectedMajorCategory;

  return (
    <Spin spinning={hierarchyLoading} tip="Loading categories...">
      <div style={{ display: 'grid', gap: 20 }}>

        {/* Division */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
            1. Division
          </Text>
          <Select
            placeholder="Select Division (Kids, Ladies, MENS)"
            value={selectedDepartment}
            onChange={handleDepartmentChange}
            style={{ width: '100%' }}
            size="large"
            allowClear
            disabled={hierarchyLoading}
            showSearch
            filterOption={(input, option) =>
              String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {departments.map(dept => (
              <Option key={dept} value={dept}>{dept}</Option>
            ))}
          </Select>
        </div>

        {/* Sub-Division */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
            2. Sub-Division
          </Text>
          <Select
            placeholder={selectedDepartment ? 'Select Sub-Division (MU, MW, LU, LW…)' : 'Select Division first'}
            value={selectedMajorCategory}
            onChange={handleMajorCategoryChange}
            style={{ width: '100%' }}
            size="large"
            allowClear
            showSearch
            disabled={!selectedDepartment || hierarchyLoading}
            filterOption={(input, option) =>
              String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {majorCategories.map(cat => (
              <Option key={cat} value={cat}>{cat}</Option>
            ))}
          </Select>
        </div>

        {/* Continue button */}
        <Divider style={{ margin: '4px 0' }} />
        <Button
          type="primary"
          size="large"
          icon={<ArrowRightOutlined />}
          disabled={!canContinue}
          onClick={handleContinue}
          style={{
            width: '100%',
            height: 48,
            fontWeight: 600,
            fontSize: 15,
            background: canContinue
              ? 'linear-gradient(135deg, #7DB9B6 0%, #E6C79C 100%)'
              : undefined,
            border: 'none',
          }}
        >
          {canContinue
            ? `Continue to Upload → ${selectedDepartment} · ${selectedMajorCategory}`
            : 'Select Division and Sub-Division to continue'}
        </Button>
      </div>
    </Spin>
  );
};
