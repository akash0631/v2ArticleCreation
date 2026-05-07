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
}

export const hierarchyService = new HierarchyService();
