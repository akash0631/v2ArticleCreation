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
import { ArrowRight } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
} from '@/shared/components/ui-tw';
import { APP_CONFIG } from '../../../constants/app/config';

export const SIMPLIFIED_HIERARCHY: Record<string, string[]> = {
  Kids: ['KB-SETS', 'KB-L', 'KB-U', 'KBW-U', 'KBW-L', 'KBW-SETS', 'KG-L', 'KG-U', 'KGW-U', 'KGW-L', 'IB', 'IG', 'KI', 'KIW', 'KB', 'KBW', 'KG'],
  Ladies: ['LU', 'LL', 'LK&L', 'LN&L', 'LW'],
  MENS: ['MU', 'MS-U', 'MS-L', 'MW', 'MO', 'MS-IW', 'ML'],
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
  if (Array.isArray(rawSubDivision)) return rawSubDivision.map((v) => String(v).trim()).filter(Boolean);
  if (typeof rawSubDivision === 'string') return rawSubDivision.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
};

export const SimplifiedCategorySelector: React.FC<SimplifiedCategorySelectorProps> = ({
  onCategorySelect,
  selectedCategory,
}) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>(selectedCategory?.department);
  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string | undefined>(selectedCategory?.majorCategory);

  const [hierarchy, setHierarchy] = useState<Record<string, string[]>>(SIMPLIFIED_HIERARCHY);
  const [hierarchyLoading, setHierarchyLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    fetch(`${APP_CONFIG.api.baseURL}/user/hierarchy`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.data?.departments?.length) return;
        const apiMap: Record<string, string[]> = {};
        for (const dept of data.data.departments) {
          if (!dept.categories?.length) continue;
          const key = normalizeDivision(dept.name) || dept.name;
          // Each category entry carries `subDepartmentCode` (e.g. "MU", "MW", "LU")
          // which is the actual sub-division code from the SubDepartment table.
          // Using c.code would give major-category codes (e.g. "MW_LW_JKT_FS") — wrong.
          const incoming = [
            ...new Set(
              (dept.categories as any[]).map((c: any) => String(c.subDepartmentCode ?? '').trim()).filter(Boolean),
            ),
          ];
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
      .catch(() => {
        /* keep fallback */
      })
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
  const majorCategories = selectedDepartment ? hierarchy[selectedDepartment] || [] : [];

  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setSelectedMajorCategory(undefined);
    onCategorySelect(null);
  };

  const handleMajorCategoryChange = (value: string) => {
    setSelectedMajorCategory(value);
    onCategorySelect(null);
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
    <Spinner spinning={hierarchyLoading} tip="Loading categories...">
      <div className="grid gap-5">
        {/* Division */}
        <div>
          <span className="mb-2 block text-sm font-semibold">1. Division</span>
          <Select value={selectedDepartment ?? ''} onValueChange={handleDepartmentChange} disabled={hierarchyLoading}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Select Division (Kids, Ladies, MENS)" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sub-Division */}
        <div>
          <span className="mb-2 block text-sm font-semibold">2. Sub-Division</span>
          <Select
            value={selectedMajorCategory ?? ''}
            onValueChange={handleMajorCategoryChange}
            disabled={!selectedDepartment || hierarchyLoading}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder={selectedDepartment ? 'Select Sub-Division (MU, MW, LU, LW…)' : 'Select Division first'} />
            </SelectTrigger>
            <SelectContent>
              {majorCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-1" />

        <Button
          size="lg"
          disabled={!canContinue}
          onClick={handleContinue}
          className="h-12 w-full text-base font-semibold"
          style={
            canContinue
              ? { background: 'linear-gradient(135deg, #7DB9B6 0%, #E6C79C 100%)', border: 'none' }
              : undefined
          }
        >
          <ArrowRight />
          {canContinue
            ? `Continue to Upload → ${selectedDepartment} · ${selectedMajorCategory}`
            : 'Select Division and Sub-Division to continue'}
        </Button>
      </div>
    </Spinner>
  );
};
