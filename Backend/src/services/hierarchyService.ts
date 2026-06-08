/**
 * Hierarchy Service — in-memory cache for the dynamic hierarchy.
 * Redis is disabled on Azure, so we use a simple Map with TTL.
 * Cache is invalidated any time an admin saves hierarchy changes.
 */

import { prismaClient as prisma } from '../utils/prisma';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> { data: T; expiresAt: number; }

export interface HierarchyCategory {
  id: number;
  code: string;
  name: string;
  garmentType: string;
  subDepartmentCode: string;
  displayOrder: number;
}

export interface HierarchyDepartment {
  id: number;
  code: string;
  name: string;
  displayOrder: number;
  categories: HierarchyCategory[];
}

export interface SimpleHierarchy {
  departments: HierarchyDepartment[];
}

export interface AttributeForExtraction {
  key: string;
  label: string;
  type: string;
  confidenceThreshold: number;
  aiExtractable: boolean;
  displayOrder: number;
}

export interface CategoryForExtraction {
  id: number;
  code: string;
  name: string;
  garmentType: string;
  departmentName: string;
  attributes: AttributeForExtraction[];
}

class HierarchyService {
  private cache = new Map<string, CacheEntry<any>>();

  private get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private set<T>(key: string, data: T): void {
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  invalidate(): void {
    this.cache.clear();
    console.log('[HierarchyService] Cache invalidated');
  }

  async getSimpleHierarchy(): Promise<SimpleHierarchy> {
    const cached = this.get<SimpleHierarchy>('simple');
    if (cached) return cached;

    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        subDepartments: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            categories: {
              where: { isActive: true },
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                code: true,
                name: true,
                garmentType: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    });

    const result: SimpleHierarchy = {
      departments: departments.map(dept => ({
        id: dept.id,
        code: dept.code,
        name: dept.name,
        displayOrder: dept.displayOrder,
        categories: dept.subDepartments.flatMap(sub =>
          sub.categories.map(cat => ({
            id: cat.id,
            code: cat.code,
            name: cat.name,
            garmentType: cat.garmentType as string,
            subDepartmentCode: sub.code,
            displayOrder: cat.displayOrder,
          }))
        ),
      })),
    };

    this.set('simple', result);
    return result;
  }

  async getCategoryForExtraction(code: string): Promise<CategoryForExtraction | null> {
    const cacheKey = `cat:${code}`;
    const cached = this.get<CategoryForExtraction>(cacheKey);
    if (cached) return cached;

    const category = await prisma.category.findUnique({
      where: { code },
      include: {
        subDepartment: {
          include: {
            department: { select: { name: true, code: true } },
          },
        },
        attributes: {
          where: { isEnabled: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            attribute: {
              select: {
                key: true,
                label: true,
                type: true,
                confidenceThreshold: true,
                aiExtractable: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    });

    if (!category) return null;

    const result: CategoryForExtraction = {
      id: category.id,
      code: category.code,
      name: category.name,
      garmentType: category.garmentType as string,
      departmentName: category.subDepartment.department.name,
      attributes: category.attributes
        .filter(ca => ca.attribute.aiExtractable)
        .map(ca => ({
          key: ca.attribute.key,
          label: ca.attribute.label,
          type: ca.attribute.type as string,
          confidenceThreshold: Number(ca.attribute.confidenceThreshold) * 100, // convert 0.65 → 65
          aiExtractable: ca.attribute.aiExtractable,
          displayOrder: ca.attribute.displayOrder,
        })),
    };

    this.set(cacheKey, result);
    return result;
  }

  /**
   * The set of `master_attributes.key` values that are governed by the grid
   * (i.e. have a non-null `grid_attribute_name`). These are the garment
   * attributes whose values must come from the per-category grid whitelist.
   *
   * Attributes NOT in this set (e.g. design_number, rate, vendor_name,
   * major_category, division, size) are metadata/identity fields and are
   * never grid-constrained.
   */
  async getGridGovernedKeys(): Promise<Set<string>> {
    const cached = this.get<string[]>('gridGovernedKeys');
    if (cached) return new Set(cached);

    const rows = await prisma.$queryRaw<{ key: string }[]>`
      SELECT key
      FROM master_attributes
      WHERE grid_attribute_name IS NOT NULL
        AND TRIM(grid_attribute_name) <> ''
        AND is_active = true
    `;
    const keys = rows.map(r => r.key).filter(Boolean);
    this.set('gridGovernedKeys', keys);
    return new Set(keys);
  }

  /**
   * Per-major-category allowed values from `maj_cat_grid_values`.
   *
   * Joins the grid table to `master_attributes` via the canonical
   * `grid_attribute_name` column, returning a map of
   *   schemaKey (master_attributes.key) → allowed shortForm values[]
   * for the given major category.
   *
   * STRICT scoping: this is the per-category whitelist. There is NO fallback
   * to the global `attribute_allowed_values`. If the category has no grid rows,
   * the returned map is empty (caller must treat that as "extract nothing").
   */
  async getCategoryGridValues(majorCategory: string): Promise<Map<string, string[]>> {
    const code = String(majorCategory || '').trim();
    if (!code) return new Map();

    const cacheKey = `grid:${code.toUpperCase()}`;
    const cached = this.get<Record<string, string[]>>(cacheKey);
    if (cached) return new Map(Object.entries(cached));

    const rows = await prisma.$queryRaw<
      { schema_key: string; value: string }[]
    >`
      SELECT m.key AS schema_key, g.value AS value
      FROM maj_cat_grid_values g
      JOIN master_attributes m
        ON m.grid_attribute_name = g.attribute_name
       AND m.is_active = true
      WHERE UPPER(TRIM(g.major_category)) = ${code.toUpperCase()}
        AND g.value IS NOT NULL
        AND TRIM(g.value) <> ''
    `;

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const key = row.schema_key;
      const val = String(row.value).trim();
      // Skip empty and pure-dash placeholders ("-", "--") — these are
      // "no value" markers in the grid, not real allowed choices.
      if (!val || /^-+$/.test(val)) continue;
      if (!map.has(key)) map.set(key, []);
      const list = map.get(key)!;
      if (!list.includes(val)) list.push(val);
    }

    // Cache as plain object (Map isn't required to be serializable, but keeps
    // the cache shape consistent with the rest of this service).
    this.set(cacheKey, Object.fromEntries(map));
    return map;
  }
}

export const hierarchyService = new HierarchyService();
