/**
 * Simplified Category Selector — DB-driven
 * Fetches departments and categories from the hierarchy API.
 * Falls back to hardcoded data if the API is unavailable.
 */
import { useState, useEffect, useMemo } from 'react';
import { RotateCw, Info } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  const [selectedMajorCategory, setSelectedMajorCategory] = useState<string | undefined>(
    selectedCategory?.majorCategory,
  );

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
        const map: Record<string, string[]> = {};
        for (const dept of data.data.departments) {
          if (dept.categories?.length) {
            map[dept.name] = dept.categories.map((c: any) => c.code);
          }
        }
        if (Object.keys(map).length) setHierarchy(map);
      })
      .catch(() => {})
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
    ? (hierarchy[selectedDepartment] || []).filter((cat) => {
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
      <Card className="category-summary rounded-xl">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <h4 className="m-0 text-xl font-semibold text-primary">{selectedMajorCategory}</h4>
            <span className="text-sm text-muted-foreground">
              {selectedDepartment} → {selectedMajorCategory}
            </span>
            <div className="mt-2">
              <Badge variant="info" className="selection-badge">
                Sub-Division Selected
              </Badge>
            </div>
          </div>
          {!creatorScope.isSingleScopedCreator ? (
            <Button variant="outline" onClick={handleReset} className="btn-secondary">
              <RotateCw />
              Change Sub-Division
            </Button>
          ) : (
            <Badge variant="warning">Fixed Scope</Badge>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="category-selector rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <Info className="h-4 w-4" />
          Select Category (Simplified)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Spinner spinning={hierarchyLoading} tip="Loading categories...">
          <div className="grid gap-4">
            <div>
              <span className="mb-2 block font-medium">1. Choose Division</span>
              <Select
                value={selectedDepartment}
                onValueChange={handleDepartmentChange}
                disabled={!!creatorScope.restrictedDivision || hierarchyLoading}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select division (Kids, Ladies, MENS)" />
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

            {selectedDepartment && (
              <div>
                <span className="mb-2 block font-medium">2. Choose Sub-Division</span>
                <Select value={selectedMajorCategory} onValueChange={setSelectedMajorCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select sub-division (Tops, Bottoms, etc.)" />
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
            )}

            {selectedDepartment && !selectedMajorCategory && (
              <div className="rounded-lg border border-sky-300 bg-sky-50 p-3">
                <span className="text-sm text-sky-900">Select a major category to proceed</span>
              </div>
            )}
          </div>
        </Spinner>
      </CardContent>
    </Card>
  );
};
