/**
 * Admin Controller - Hierarchy Management APIs
 * Complete CRUD operations for managing the fashion hierarchy
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { prismaClient as prisma, withPrismaRetry } from '../utils/prisma';
import bcrypt from 'bcryptjs';
import { syncVendorMaster, getVendorMasterStatus } from '../services/vendorMasterSyncService';
import { invalidateMandatoryGridCache, invalidateMajCatVisibleCache } from '../services/zmmArtCreationService';
import { invalidateFieldVisibilityCache } from '../utils/categoryFieldVisibility';
import path from 'path';
import fs from 'fs';

// ═══════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════

const DepartmentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const SubDepartmentSchema = z.object({
  departmentId: z.number().int(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const CategorySchema = z.object({
  subDepartmentId: z.number().int(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const MasterAttributeSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  type: z.enum(['TEXT', 'SELECT', 'NUMBER']),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  group: z.string().max(50).optional().nullable(),
});

const AllowedValueSchema = z.object({
  attributeId: z.number().int(),
  shortForm: z.string().min(1).max(100),
  fullForm: z.string().min(1).max(200),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const AdminCreateUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
  name: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'USER', 'CREATOR', 'PO_COMMITTEE', 'APPROVER', 'CATEGORY_HEAD', 'SUB_DIVISION_HEAD', 'PD_DESIGNER']).optional().default('USER'),
  division: z.string().optional().nullable(),
  subDivision: z.union([z.string(), z.array(z.string())]).optional().nullable(),
});

const AdminUpdateUserSchema = AdminCreateUserSchema.partial().extend({


  password: z.string().min(6).max(128).optional(),
});

const normalizeSubDivisionInput = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  const tokens = Array.isArray(value)
    ? value.map((item) => String(item || '').trim())
    : String(value)
        .split(/[;,|]+/)
        .map((item) => String(item || '').trim());

  const unique = Array.from(new Set(tokens.filter(Boolean)));
  if (unique.length === 0) return null;
  return unique.join(',');
};

// ═══════════════════════════════════════════════════════
// DEPARTMENTS API
// ═══════════════════════════════════════════════════════

export const getAllDepartments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { includeSubDepts } = req.query;

    const departments = await prisma.department.findMany({
      orderBy: { displayOrder: 'asc' },
      include: includeSubDepts === 'true' ? {
        subDepartments: {
          orderBy: { displayOrder: 'asc' },
        },
      } : undefined,
    });

    res.json({ success: true, data: departments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getDepartmentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const department = await prisma.department.findUnique({
      where: { id: parseInt(id) },
      include: {
        subDepartments: {
          orderBy: { displayOrder: 'asc' },
          include: {
            categories: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!department) {
      res.status(404).json({ success: false, error: 'Department not found' });
      return;
    }

    res.json({ success: true, data: department });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = DepartmentSchema.parse(req.body);

    const department = await prisma.department.create({
      data: validated,
    });

    res.status(201).json({ success: true, data: department });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = DepartmentSchema.partial().parse(req.body);

    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: validated,
    });

    res.json({ success: true, data: department });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.department.delete({
      where: { id: parseInt(id) },
    });

    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// SUB-DEPARTMENTS API
// ═══════════════════════════════════════════════════════

export const getAllSubDepartments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { departmentId } = req.query;

    const subDepartments = await prisma.subDepartment.findMany({
      where: departmentId ? { departmentId: parseInt(departmentId as string) } : undefined,
      orderBy: { displayOrder: 'asc' },
      include: {
        department: true,
      },
    });

    res.json({ success: true, data: subDepartments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSubDepartmentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: parseInt(id) },
      include: {
        department: true,
        categories: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!subDepartment) {
      res.status(404).json({ success: false, error: 'Sub-department not found' });
      return;
    }

    res.json({ success: true, data: subDepartment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createSubDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = SubDepartmentSchema.parse(req.body);

    const subDepartment = await prisma.subDepartment.create({
      data: validated,
      include: {
        department: true,
      },
    });

    res.status(201).json({ success: true, data: subDepartment });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateSubDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = SubDepartmentSchema.partial().parse(req.body);

    const subDepartment = await prisma.subDepartment.update({
      where: { id: parseInt(id) },
      data: validated,
      include: {
        department: true,
      },
    });

    res.json({ success: true, data: subDepartment });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteSubDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const subDeptId = parseInt(id);

    // Collect all category IDs under this sub-department
    const categories = await prisma.category.findMany({
      where: { subDepartmentId: subDeptId },
      select: { id: true },
    });
    const categoryIds = categories.map(c => c.id);

    await prisma.$transaction([
      prisma.extractionJob.deleteMany({ where: { categoryId: { in: categoryIds } } }),
      prisma.categoryAttribute.deleteMany({ where: { categoryId: { in: categoryIds } } }),
      prisma.category.deleteMany({ where: { subDepartmentId: subDeptId } }),
      prisma.subDepartment.delete({ where: { id: subDeptId } }),
    ]);

    res.json({ success: true, message: 'Sub-department deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// CATEGORIES API
// ═══════════════════════════════════════════════════════

export const getAllCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const { departmentId, subDepartmentId, search, page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (subDepartmentId) {
      where.subDepartmentId = parseInt(subDepartmentId as string);
    } else if (departmentId) {
      where.subDepartment = {
        departmentId: parseInt(departmentId as string),
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        orderBy: { displayOrder: 'asc' },
        include: {
          subDepartment: {
            include: {
              department: true,
            },
          },
        },
        skip,
        take: limitNum,
      }),
      prisma.category.count({ where }),
    ]);

    res.json({
      success: true,
      data: categories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCategoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: {
        subDepartment: {
          include: {
            department: true,
          },
        },
        attributes: {
          include: {
            attribute: {
              include: {
                allowedValues: true,
              },
            },
          },
        },
      },
    });

    if (!category) {
      res.status(404).json({ success: false, error: 'Category not found' });
      return;
    }

    res.json({ success: true, data: category });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get category by code with all attributes
 * Used by frontend extraction flow
 */
export const getCategoryByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;

    const category = await prisma.category.findUnique({
      where: { code: code },
      include: {
        subDepartment: {
          include: {
            department: true,
          },
        },
        attributes: {
          orderBy: {
            displayOrder: 'asc',
          },
          include: {
            attribute: {
              include: {
                allowedValues: {
                  orderBy: {
                    displayOrder: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!category) {
      res.status(404).json({ success: false, error: `Category with code '${code}' not found` });
      return;
    }

    res.json({ success: true, data: category });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get category with ALL master attributes (showing enabled/disabled status)
 * This is used by the admin panel matrix to show all 44 attributes with toggles
 */
export const getCategoryWithAllAttributes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id);

    // Get the category
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        subDepartment: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!category) {
      res.status(404).json({ success: false, error: `Category with ID ${id} not found` });
      return;
    }

    // Get ALL master attributes
    const allAttributes = await prisma.masterAttribute.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        allowedValues: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    // Get existing category-attribute mappings
    const existingMappings = await prisma.categoryAttribute.findMany({
      where: { categoryId: categoryId },
    });

    // Create a map for quick lookup
    const mappingMap = new Map(
      existingMappings.map(m => [m.attributeId, m])
    );

    // Merge: for each master attribute, check if mapping exists
    const attributesWithStatus = allAttributes.map(attr => {
      const mapping = mappingMap.get(attr.id);
      return {
        attributeId: attr.id,
        attributeKey: attr.key,
        attributeLabel: attr.label,
        attributeType: attr.type,
        attributeGroup: attr.group ?? null,
        allowedValues: attr.allowedValues,
        isEnabled: mapping?.isEnabled || false,
        isRequired: mapping?.isRequired || false,
        displayOrder: mapping?.displayOrder || attr.displayOrder,
        defaultValue: mapping?.defaultValue || null,
        hasMapping: !!mapping,
      };
    });

    res.json({
      success: true,
      data: {
        ...category,
        allAttributes: attributesWithStatus,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = CategorySchema.parse(req.body);

    const category = await prisma.category.create({
      data: validated,
      include: {
        subDepartment: {
          include: {
            department: true,
          },
        },
      },
    });

    res.status(201).json({ success: true, data: category });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = CategorySchema.partial().parse(req.body);

    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data: validated,
      include: {
        subDepartment: {
          include: {
            department: true,
          },
        },
      },
    });

    res.json({ success: true, data: category });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const catId = parseInt(id);

    await prisma.$transaction([
      prisma.extractionJob.deleteMany({ where: { categoryId: catId } }),
      prisma.categoryAttribute.deleteMany({ where: { categoryId: catId } }),
      prisma.category.delete({ where: { id: catId } }),
    ]);

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCategoryAttributes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { attributeIds } = req.body;

    if (!Array.isArray(attributeIds)) {
      res.status(400).json({ success: false, error: 'attributeIds must be an array' });
      return;
    }

    await prisma.categoryAttribute.deleteMany({
      where: { categoryId: parseInt(id) },
    });

    const mappings = attributeIds.map((attrId: number, index: number) => ({
      categoryId: parseInt(id),
      attributeId: attrId,
      displayOrder: index,
      isRequired: false,
      isEnabled: true,
    }));

    await prisma.categoryAttribute.createMany({
      data: mappings,
    });

    res.json({ success: true, message: 'Category attributes updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update single category-attribute mapping
export const updateCategoryAttributeMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, attributeId } = req.params;
    const { isEnabled, isRequired, displayOrder, defaultValue } = req.body;

    // Use upsert to create if doesn't exist, update if exists
    const mapping = await prisma.categoryAttribute.upsert({
      where: {
        categoryId_attributeId: {
          categoryId: parseInt(categoryId),
          attributeId: parseInt(attributeId),
        },
      },
      update: {
        ...(isEnabled !== undefined && { isEnabled }),
        ...(isRequired !== undefined && { isRequired }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(defaultValue !== undefined && { defaultValue }),
        updatedAt: new Date(),
      },
      create: {
        categoryId: parseInt(categoryId),
        attributeId: parseInt(attributeId),
        isEnabled: isEnabled ?? false,
        isRequired: isRequired ?? false,
        displayOrder: displayOrder ?? 0,
        defaultValue: defaultValue ?? null,
      },
    });

    res.json({ success: true, data: mapping, message: 'Mapping updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Add attribute to category
export const addAttributeToCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.params;
    const { attributeId, isEnabled, isRequired, displayOrder, defaultValue } = req.body;

    const mapping = await prisma.categoryAttribute.create({
      data: {
        categoryId: parseInt(categoryId),
        attributeId,
        isEnabled: isEnabled ?? true,
        isRequired: isRequired ?? false,
        displayOrder: displayOrder ?? 0,
        defaultValue: defaultValue ?? null,
      },
      include: {
        attribute: {
          include: {
            allowedValues: true,
          },
        },
      },
    });

    res.status(201).json({ success: true, data: mapping });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Remove attribute from category
export const removeAttributeFromCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, attributeId } = req.params;

    await prisma.categoryAttribute.deleteMany({
      where: {
        categoryId: parseInt(categoryId),
        attributeId: parseInt(attributeId),
      },
    });

    res.json({ success: true, message: 'Attribute removed from category' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// MASTER ATTRIBUTES API
// ═══════════════════════════════════════════════════════

export const getAllMasterAttributes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { includeValues } = req.query;

    const attributes = await prisma.masterAttribute.findMany({
      orderBy: { displayOrder: 'asc' },
      include: includeValues === 'true' ? {
        allowedValues: {
          orderBy: { displayOrder: 'asc' },
        },
      } : undefined,
    });

    res.json({ success: true, data: attributes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMasterAttributeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const attribute = await prisma.masterAttribute.findUnique({
      where: { id: parseInt(id) },
      include: {
        allowedValues: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!attribute) {
      res.status(404).json({ success: false, error: 'Attribute not found' });
      return;
    }

    res.json({ success: true, data: attribute });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createMasterAttribute = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = MasterAttributeSchema.parse(req.body);

    const attribute = await prisma.masterAttribute.create({
      data: validated,
    });

    res.status(201).json({ success: true, data: attribute });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateMasterAttribute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = MasterAttributeSchema.partial().parse(req.body);

    const attribute = await prisma.masterAttribute.update({
      where: { id: parseInt(id) },
      data: validated,
    });

    res.json({ success: true, data: attribute });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteMasterAttribute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.masterAttribute.delete({
      where: { id: parseInt(id) },
    });

    res.json({ success: true, message: 'Attribute deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const addAllowedValue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = AllowedValueSchema.omit({ attributeId: true }).parse(req.body);

    const allowedValue = await prisma.attributeAllowedValue.create({
      data: {
        ...validated,
        attributeId: parseInt(id),
      },
    });

    res.status(201).json({ success: true, data: allowedValue });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.issues });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteAllowedValue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { valueId } = req.params;

    await prisma.attributeAllowedValue.delete({
      where: { id: parseInt(valueId) },
    });

    res.json({ success: true, message: 'Allowed value deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// HIERARCHY API
// ═══════════════════════════════════════════════════════

let hierarchyTreeCache: { data: unknown; expiry: number } | null = null;
const HIERARCHY_TREE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Lightweight tree cache (no attributes — for Attribute Mapping left panel)
let hierarchyLightweightCache: { data: unknown; expiry: number } | null = null;

export const getHierarchyTreeLightweight = async (_req: Request, res: Response): Promise<void> => {
  try {
    if (hierarchyLightweightCache && Date.now() < hierarchyLightweightCache.expiry) {
      res.json(hierarchyLightweightCache.data);
      return;
    }

    // Fetch departments + subDepartments + categories (NO attributes)
    const departments = await prisma.department.findMany({
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        displayOrder: true,
        subDepartments: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            name: true,
            code: true,
            displayOrder: true,
            categories: {
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                name: true,
                code: true,
                garmentType: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    });

    // Compute per-category attribute counts via two lightweight groupBy queries
    const [totalCounts, enabledCounts] = await Promise.all([
      prisma.categoryAttribute.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
      }),
      prisma.categoryAttribute.groupBy({
        by: ['categoryId'],
        where: { isEnabled: true },
        _count: { categoryId: true },
      }),
    ]);

    const totalMap = new Map(totalCounts.map(r => [r.categoryId, r._count.categoryId]));
    const enabledMap = new Map(enabledCounts.map(r => [r.categoryId, r._count.categoryId]));

    // Merge counts into the category objects
    const departmentsWithCounts = departments.map(dept => ({
      ...dept,
      subDepartments: dept.subDepartments.map(sub => ({
        ...sub,
        categories: sub.categories.map(cat => ({
          ...cat,
          totalCount: totalMap.get(cat.id) ?? 0,
          enabledCount: enabledMap.get(cat.id) ?? 0,
        })),
      })),
    }));

    const responseData = {
      success: true,
      data: { departments: departmentsWithCounts },
    };

    hierarchyLightweightCache = { data: responseData, expiry: Date.now() + HIERARCHY_TREE_TTL_MS };
    res.json(responseData);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getHierarchyTree = async (req: Request, res: Response): Promise<void> => {
  try {
    if (hierarchyTreeCache && Date.now() < hierarchyTreeCache.expiry) {
      res.json(hierarchyTreeCache.data);
      return;
    }

    const departments = await prisma.department.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        subDepartments: {
          orderBy: { displayOrder: 'asc' },
          include: {
            categories: {
              orderBy: { displayOrder: 'asc' },
              include: {
                attributes: {
                  orderBy: { displayOrder: 'asc' },
                  include: {
                    attribute: {
                      select: {
                        id: true,
                        key: true,
                        label: true,
                        group: true,
                        displayOrder: true,
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Count totals
    const totalCategories = departments.reduce((acc, dept) =>
      acc + dept.subDepartments.reduce((subAcc, subDept) =>
        subAcc + subDept.categories.length, 0), 0);

    const totalAttributes = await prisma.masterAttribute.count();

    const responseData = {
      success: true,
      data: {
        departments,
        totalCategories,
        totalAttributes
      }
    };

    hierarchyTreeCache = { data: responseData, expiry: Date.now() + HIERARCHY_TREE_TTL_MS };

    res.json(responseData);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const clearAllHierarchyCaches = (): void => {
  hierarchyTreeCache = null;
  hierarchyLightweightCache = null;
};

export const invalidateHierarchyCache = async (_req: Request, res: Response): Promise<void> => {
  clearAllHierarchyCaches();
  res.json({ success: true, message: 'Hierarchy tree cache cleared' });
};

export const exportHierarchy = async (req: Request, res: Response): Promise<void> => {
  try {
    const [departments, attributes] = await Promise.all([
      prisma.department.findMany({
        include: {
          subDepartments: {
            include: {
              categories: {
                include: {
                  attributes: {
                    include: {
                      attribute: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.masterAttribute.findMany({
        include: {
          allowedValues: true,
        },
      }),
    ]);

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      departments,
      masterAttributes: attributes,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=hierarchy-export.json');
    res.json(exportData);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// EXTRACTION HISTORY (ADMIN ONLY)
// ═══════════════════════════════════════════════════════

export const getAllExtractions = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.extractionJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          category: {
            select: {
              code: true,
              name: true,
              subDepartment: {
                select: {
                  name: true,
                  department: {
                    select: {
                      name: true
                    }
                  }
                }
              }
            }
          },
          user: { select: { id: true, name: true, email: true, role: true } },
          results: {
            select: {
              id: true,
              rawValue: true,
              finalValue: true,
              confidence: true,
              attribute: { select: { key: true, label: true } }
            }
          }
        }
      }),
      prisma.extractionJob.count()
    ]);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// USER MANAGEMENT (ADMIN ONLY)
// ═══════════════════════════════════════════════════════

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        division: true,
        subDivision: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      }
    });

    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = AdminCreateUserSchema.parse(req.body);
    const normalizedSubDivision = normalizeSubDivisionInput(validated.subDivision);

    if ((validated.role === 'CREATOR' || validated.role === 'APPROVER' || validated.role === 'SUB_DIVISION_HEAD') && (!validated.division || !normalizedSubDivision)) {
      res.status(400).json({ success: false, error: 'Division and Sub-Division are required for this role' });
      return;
    }

    if (validated.role === 'CATEGORY_HEAD' && !validated.division) {
      res.status(400).json({ success: false, error: 'Division is required for Category Head' });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
      select: { id: true, isActive: true }
    });

    const hashedPassword = await bcrypt.hash(validated.password, 10);

    if (existing) {
      if (existing.isActive) {
        res.status(409).json({ success: false, error: 'User already exists with this email' });
        return;
      }

      // Reactivate existing inactive user
      const updatedUser = await prisma.user.update({
        where: { id: existing.id },
        data: {
          password: hashedPassword,
          name: validated.name,
          role: validated.role as any,
          division: validated.role === 'PO_COMMITTEE' ? null : validated.division,
          subDivision: (validated.role === 'CATEGORY_HEAD' || validated.role === 'PO_COMMITTEE' || validated.role === 'ADMIN') ? null : normalizedSubDivision,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          division: true,
          subDivision: true,
          isActive: true,
          createdAt: true,
        }
      });

      res.status(200).json({ success: true, data: updatedUser, message: 'User reactivated successfully' });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: validated.email.toLowerCase(),
        password: hashedPassword,
        name: validated.name,
        role: validated.role as any,
        division: validated.role === 'PO_COMMITTEE' ? null : validated.division,
        subDivision: (validated.role === 'CATEGORY_HEAD' || validated.role === 'PO_COMMITTEE' || validated.role === 'ADMIN') ? null : normalizedSubDivision,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        division: true,
        subDivision: true,
        isActive: true,
        createdAt: true,
      }
    });

    res.status(201).json({ success: true, data: user });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      res.status(400).json({ success: false, error: errorMessage });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = AdminUpdateUserSchema.parse(req.body);
    const userId = parseInt(id);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const finalRole = validated.role ?? existingUser.role;
    const finalDivision = validated.division !== undefined ? validated.division : existingUser.division;
    const finalSubDivision = validated.subDivision !== undefined
      ? normalizeSubDivisionInput(validated.subDivision)
      : existingUser.subDivision;

    if ((finalRole === 'CREATOR' || finalRole === 'APPROVER' || finalRole === 'SUB_DIVISION_HEAD') && (!finalDivision || !finalSubDivision)) {
      res.status(400).json({ success: false, error: 'Division and Sub-Division are required for this role' });
      return;
    }

    if (finalRole === 'CATEGORY_HEAD' && !finalDivision) {
      res.status(400).json({ success: false, error: 'Division is required for Category Head' });
      return;
    }

    // Prepare update data
    const updateData: any = {
      name: validated.name,
      role: validated.role as any,
      division: finalRole === 'PO_COMMITTEE' ? null : validated.division,
      subDivision: (finalRole === 'CATEGORY_HEAD' || finalRole === 'PO_COMMITTEE' || finalRole === 'ADMIN') ? null : (validated.subDivision !== undefined ? normalizeSubDivisionInput(validated.subDivision) : undefined),
      email: validated.email ? validated.email.toLowerCase() : undefined,
    };

    // Only update password if provided
    if (validated.password) {
      updateData.password = await bcrypt.hash(validated.password, 10);
    }

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        division: true,
        subDivision: true,
        isActive: true,
        createdAt: true,
      }
    });

    res.json({ success: true, data: updatedUser, message: 'User updated successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      res.status(400).json({ success: false, error: errorMessage });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deactivateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id);

    if (req.user?.id === targetId) {
      res.status(400).json({ success: false, error: 'You cannot deactivate your own account' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true }
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true }
      });
      if (adminCount <= 1) {
        res.status(400).json({ success: false, error: 'Cannot deactivate the last active admin' });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: false }
    });

    res.json({ success: true, data: { id: updated.id, isActive: updated.isActive } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUploads = await prisma.extractionResultFlat.count();

    const completed = await prisma.extractionResultFlat.count({
      where: { extractionStatus: 'COMPLETED' }
    });

    const failed = await prisma.extractionResultFlat.count({
      where: {
        extractionStatus: {
          in: ['FAILED', 'ERROR']
        }
      }
    });

    const pending = await prisma.extractionResultFlat.count({
      where: {
        extractionStatus: {
          in: ['PENDING', 'PROCESSING']
        }
      }
    });

    res.json({
      success: true,
      data: {
        totalUploads,
        completed,
        failed,
        pending
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// EXPENSE AND IMAGE ANALYTICS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════

/**
 * Get total expenses from all extraction jobs
 * Calculates total cost price and total selling price
 */
export const getExpenseAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo, status } = req.query;

    const flatWhere: any = {
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom as string) } : {}),
          ...(dateTo ? { lte: new Date(dateTo as string) } : {})
        }
      } : {}),
      ...(status ? { extractionStatus: status as string } : {})
    };

    const [summary, statusGroups, totalJobsWithCosts] = await withPrismaRetry(() => Promise.all([
      prisma.extractionResultFlat.aggregate({
        where: flatWhere,
        _sum: {
          apiCost: true,
          rate: true
        }
      }),
      prisma.extractionResultFlat.groupBy({
        by: ['extractionStatus'],
        where: flatWhere,
        _count: { _all: true },
        _sum: {
          apiCost: true,
          rate: true
        }
      }),
      prisma.extractionResultFlat.count({ where: flatWhere })
    ]));

    const totalCostPrice = summary._sum.apiCost ? parseFloat(summary._sum.apiCost.toString()) : 0;
    const totalSellingPrice = summary._sum.rate ? parseFloat(summary._sum.rate.toString()) : 0;
    const totalProfit = totalSellingPrice - totalCostPrice;
    const profitMargin = totalSellingPrice > 0 ? ((totalProfit / totalSellingPrice) * 100).toFixed(2) : '0.00';

    const statusBreakdown: any = {};
    statusGroups.forEach((group) => {
      const statusKey = group.extractionStatus || 'UNKNOWN';
      statusBreakdown[statusKey] = {
        count: group._count._all,
        totalCostPrice: group._sum.apiCost ? parseFloat(group._sum.apiCost.toString()) : 0,
        totalSellingPrice: group._sum.rate ? parseFloat(group._sum.rate.toString()) : 0,
      };
    });

    res.json({
      success: true,
      data: {
        totalCostPrice: parseFloat(totalCostPrice.toFixed(4)), // higher precision for API costs
        totalSellingPrice: parseFloat(totalSellingPrice.toFixed(2)),
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        profitMargin: parseFloat(profitMargin),
        totalJobsWithCosts,
        jobsWithoutCosts: 0, // Flat table entries should have costs
        statusBreakdown,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get total number of images used for attribute extraction.
 * Uses DB-level aggregations — never loads all rows into memory.
 */
export const getImageUsageAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo, status, categoryId } = req.query;

    // Build shared where clause
    const where: any = {};
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo)   where.createdAt.lte = new Date(dateTo as string);
    }
    if (status)     where.status     = status as string;
    if (categoryId) where.categoryId = parseInt(categoryId as string);

    // ── All aggregations run in parallel at the DB level ──────────────────────
    const [
      totalImages,
      uniqueImageUrls,
      byStatus,
      byCategory,
      byDay,
    ] = await Promise.all([
      // Total job count
      prisma.extractionJob.count({ where }),

      // Distinct image URLs (proxy for unique images)
      prisma.extractionJob.findMany({
        where,
        select: { imageUrl: true },
        distinct: ['imageUrl'],
      }),

      // Count grouped by status
      prisma.extractionJob.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),

      // Count grouped by category (join via sub-query)
      prisma.extractionJob.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
      }),

      // Count grouped by date (last 30 days only, keep payload small)
      prisma.extractionJob.groupBy({
        by: ['createdAt'],
        where: {
          ...where,
          createdAt: {
            ...(where.createdAt ?? {}),
            gte: where.createdAt?.gte ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _count: { _all: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Resolve category names for the category breakdown
    const categoryIds = byCategory.map(r => r.categoryId).filter(Boolean) as number[];
    const categories = categoryIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const catMap = new Map(categories.map(c => [c.id, c]));

    // Shape responses
    const statusBreakdown: Record<string, number> = {};
    for (const r of byStatus) statusBreakdown[r.status] = r._count._all;

    const categoryBreakdown: Record<string, number> = {};
    for (const r of byCategory) {
      const cat = catMap.get(r.categoryId!);
      const key = cat ? `${cat.code} (${cat.name})` : String(r.categoryId);
      categoryBreakdown[key] = r._count._all;
    }

    // Collapse groupBy-createdAt into YYYY-MM-DD buckets
    const dailyBreakdown: Record<string, number> = {};
    for (const r of byDay) {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      dailyBreakdown[day] = (dailyBreakdown[day] ?? 0) + r._count._all;
    }
    const sortedDaily = Object.keys(dailyBreakdown).sort().reduce(
      (acc: Record<string, number>, k) => { acc[k] = dailyBreakdown[k]; return acc; }, {}
    );
    const dayCount = Object.keys(sortedDaily).length;

    res.json({
      success: true,
      data: {
        totalImages,
        uniqueImages: uniqueImageUrls.length,
        averageImagesPerDay: (totalImages / Math.max(dayCount, 1)).toFixed(2),
        statusBreakdown,
        categoryBreakdown,
        dailyBreakdown: sortedDaily,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get detailed expense data per image
 * Returns image URL, tokens, and cost for each extraction
 */
export const getDetailedExpenses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit, offset } = req.query;

    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : 500;
    const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : 0;
    // Hard cap at 1000 to prevent OOM — 64k+ records in one JSON response crashes the process
    const take = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 500, 1000);

    const whereClause = {
      extractionStatus: 'COMPLETED', // Only show completed extractions
    } as const;

    // Fetch detailed expense data from flat table (paginated)
    const expenses = await prisma.extractionResultFlat.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take,
      ...(parsedOffset > 0 ? { skip: parsedOffset } : {}),
      select: {
        jobId: true,
        imageName: true,
        articleNumber: true,
        imageUrl: true,
        inputTokens: true,
        outputTokens: true,
        apiCost: true,
        createdAt: true,
        majorCategory: true,
        designNumber: true,
      },
    });

    // Format the data for frontend
    const formattedExpenses = expenses.map((expense) => ({
      key: expense.jobId,
      imageName: expense.imageName || expense.designNumber || 'Unknown',
      articleNumber: expense.articleNumber, // Include article number
      imageUrl: expense.imageUrl,
      inputTokens: expense.inputTokens || 0,
      outputTokens: expense.outputTokens || 0,
      cost: expense.apiCost ? parseFloat(expense.apiCost.toString()) : 0,
      category: expense.majorCategory || 'N/A',
      createdAt: expense.createdAt,
    }));

    const totalCount = await prisma.extractionResultFlat.count({ where: whereClause });

    res.json({
      success: true,
      data: formattedExpenses,
      total: totalCount,
    });
  } catch (error: any) {
    console.error('Error fetching detailed expenses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// BACKFILL: Fix subDivision for all watcher articles using majorCategory
// POST /api/admin/backfill-watcher-subdivisions
// Logic:
//   - majorCategory present → look up Category.code → SubDepartment.code → use as subDivision
//   - majorCategory absent  → set subDivision = null
// ═══════════════════════════════════════════════════════
export const backfillWatcherSubDivisions = async (req: Request, res: Response) => {
  try {
    // Load all watcher flat rows
    const rows = await prisma.extractionResultFlat.findMany({
      where: { source: 'WATCHER' },
      select: { id: true, majorCategory: true, subDivision: true },
    });

    // Build a cache: majorCategory code → subDepartment code (avoid repeated DB hits)
    const cache = new Map<string, string | null>();

    let updated = 0;
    let cleared = 0;
    let notFound = 0;
    let skipped = 0;

    for (const row of rows) {
      const mc = row.majorCategory?.trim() || null;

      if (!mc) {
        // No major category — clear subDivision
        if (row.subDivision !== null && row.subDivision !== '') {
          await prisma.extractionResultFlat.update({
            where: { id: row.id },
            data: { subDivision: null },
          });
          cleared++;
        } else {
          skipped++;
        }
        continue;
      }

      // Look up correct subDivision from DB category
      let correctSubDivision: string | null;
      if (cache.has(mc)) {
        correctSubDivision = cache.get(mc)!;
      } else {
        const category = await prisma.category.findFirst({
          where: { code: { equals: mc, mode: 'insensitive' } },
          select: { subDepartment: { select: { code: true } } },
        });
        correctSubDivision = category?.subDepartment?.code ?? null;
        cache.set(mc, correctSubDivision);
      }

      if (!correctSubDivision) {
        // Category not found in DB — leave subDivision unchanged
        notFound++;
        continue;
      }

      // Only update if it's currently wrong
      if (row.subDivision !== correctSubDivision) {
        await prisma.extractionResultFlat.update({
          where: { id: row.id },
          data: { subDivision: correctSubDivision },
        });
        updated++;
      } else {
        skipped++;
      }
    }

    res.json({
      success: true,
      message: 'Watcher subDivision backfill complete',
      stats: {
        total: rows.length,
        updated,
        cleared,
        notFound,
        skipped,
      },
    });
  } catch (error: any) {
    console.error('Error in backfillWatcherSubDivisions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// SRM SYNC (ADMIN)
// ═══════════════════════════════════════════════════════

/**
 * GET /api/admin/srm/status
 * Returns current DB SRM stats + next scheduled sync windows.
 * Does NOT call the external SRM API (fast, DB-only).
 */
export const getSrmSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const [total, byDivision, byStatus, lastRecord, pendingEnrichment, hiddenFromApprovers] = await Promise.all([
      prisma.extractionResultFlat.count({ where: { source: 'SRM' } }),
      prisma.extractionResultFlat.groupBy({
        by: ['division'],
        where: { source: 'SRM' },
        _count: { _all: true },
      }),
      prisma.extractionResultFlat.groupBy({
        by: ['approvalStatus'],
        where: { source: 'SRM' },
        _count: { _all: true },
      }),
      prisma.extractionResultFlat.findFirst({
        where: { source: 'SRM' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.extractionResultFlat.count({
        where: { source: 'SRM', extractionStatus: 'SRM_IMPORT', imageUrl: { not: null } },
      }),
      // Records currently hidden from approvers because extraction is still running (<30min old)
      prisma.extractionResultFlat.count({
        where: {
          source: 'SRM',
          extractionStatus: 'SRM_IMPORT',
          createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
        },
      }),
    ]);

    // Next scheduled syncs: 12:00 and 20:00 IST = 06:30 and 14:30 UTC
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().slice(0, 10);
    const nextSyncs = ['12:00', '20:00'].map(t => {
      const [h, m] = t.split(':').map(Number);
      const candidate = new Date(`${todayIST}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`);
      // candidate is in IST-as-UTC; convert to real UTC
      const realUtc = new Date(candidate.getTime() - istOffset);
      if (realUtc <= now) realUtc.setDate(realUtc.getDate() + 1);
      return { istTime: t, utc: realUtc.toISOString() };
    });

    const { getLastSrmSyncResult } = await import('../services/srmSyncService');

    res.json({
      success: true,
      data: {
        totalInDb: total,
        lastSyncAt: lastRecord?.createdAt ?? null,
        pendingEnrichment,
        hiddenFromApprovers,
        divisionBreakdown: byDivision.map(r => ({ division: r.division, count: r._count._all })),
        statusBreakdown: byStatus.map(r => ({ status: r.approvalStatus, count: r._count._all })),
        nextScheduledSyncs: nextSyncs,
        schedule: 'Daily at 12:00 PM and 8:00 PM IST',
        lastSyncResult: getLastSrmSyncResult(),
      },
    });
  } catch (error: any) {
    console.error('Error in getSrmSyncStatus:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/srm/sync
 * Manually triggers a full SRM sync. Idempotent — existing records are skipped.
 * Returns inserted / skipped / errors counts. VLM enrichment runs sequentially in background.
 */
export const triggerSrmSync = async (req: Request, res: Response): Promise<void> => {
  // SRM sync can take 2+ minutes — respond immediately and run in background
  // to avoid the request timeout firing and causing "headers already sent" errors
  res.status(202).json({ success: true, message: 'SRM sync started in background. Check server logs for results.' });

  try {
    const { syncFromSrm } = await import('../services/srmSyncService');
    console.log('[Admin] Manual SRM sync triggered');
    const result = await syncFromSrm();
    console.log(`[Admin] Manual SRM sync complete — inserted:${result.inserted} skipped:${result.skipped} errors:${result.errors}`);
  } catch (error: any) {
    console.error('Error in triggerSrmSync:', error);
  }
};

/**
 * POST /api/admin/srm/enrich
 * Backfills VLM extraction for all SRM records that have an image but are still
 * at SRM_IMPORT status. Runs sequentially (2s gap per record) to avoid rate limits.
 * Returns immediately with a count; enrichment continues in background.
 */
export const triggerSrmEnrichment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { backfillSrmVlmEnrichment } = await import('../services/srmSyncService');

    // Respond IMMEDIATELY — enrichment runs for many minutes and even a count query
    // can hang >100s (Cloudflare timeout) if the DB pool is busy from a prior run.
    res.json({
      success: true,
      message: 'SRM enrichment started in background. Check server logs for progress.',
    });

    // Count + run entirely in background after response is sent
    void (async () => {
      try {
        const { prismaClient: prisma } = await import('../utils/prisma');
        const pending = await prisma.extractionResultFlat.count({
          where: { source: 'SRM', extractionStatus: 'SRM_IMPORT', imageUrl: { not: null } },
        });
        if (pending === 0) {
          console.log('[Admin] SRM enrichment: all records already enriched.');
          return;
        }
        console.log(`[Admin] Manual SRM enrichment triggered — ${pending} records to process`);
        const r = await backfillSrmVlmEnrichment();
        console.log(`[Admin] SRM enrichment complete — enriched:${r.enriched} failed:${r.failed}`);
      } catch (err: any) {
        console.error('[Admin] SRM enrichment background error:', err?.message);
      }
    })();
  } catch (error: any) {
    console.error('Error in triggerSrmEnrichment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/srm/sync-by-ref
 * Fetch a single SRM presentation by PPT ref_no and insert/enrich its images.
 * Body: { refNo: string, approvedOnly?: boolean }
 */
export const syncSrmByRef = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refNo, approvedOnly } = req.body as { refNo?: string; approvedOnly?: boolean };

    if (!refNo || typeof refNo !== 'string' || !refNo.trim()) {
      res.status(400).json({ success: false, error: 'refNo is required (e.g. PRES-00721)' });
      return;
    }

    const cleanRef = refNo.trim().toUpperCase();

    // ── Duplicate presentation guard ─────────────────────────────────────
    // Block re-sync if this presentation already has records in extraction_results_flat.
    const existingCount = await prisma.extractionResultFlat.count({
      where: { pptNumber: cleanRef },
    });
    if (existingCount > 0) {
      res.status(409).json({
        success: false,
        error: `Presentation ${cleanRef} already has ${existingCount} record(s) in the database. Re-extraction is not allowed to prevent duplicates.`,
        existingCount,
      });
      return;
    }

    const { syncSinglePresentation } = await import('../services/srmSyncService');
    console.log(`[Admin] Single PPT sync triggered for: ${cleanRef}`);

    const result = await syncSinglePresentation(cleanRef, approvedOnly === true);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error in syncSrmByRef:', error);
    // Pass through 404 from SRM API as a 404 to the client
    if (error.message?.includes('HTTP 404')) {
      res.status(404).json({ success: false, error: `Presentation not found: ${req.body?.refNo}` });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// SRM FAILED EXTRACTIONS (ADMIN)
// ═══════════════════════════════════════════════════════

/**
 * GET /api/admin/srm/failed-extractions
 *
 * Returns paginated SRM records that are still at SRM_IMPORT status
 * (inserted but VLM enrichment never completed).
 *
 * Query params:
 *   page        default 1
 *   limit       default 50, max 200
 *   search      filter by ppt_number or design_number (case-insensitive)
 *   division    filter by division
 */
export const getSrmFailedExtractions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prismaClient: prisma } = await import('../utils/prisma');

    const page  = Math.max(1, parseInt(req.query.page  as string || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || '50', 10)));
    const skip  = (page - 1) * limit;

    const search   = (req.query.search   as string || '').trim();
    const division = (req.query.division as string || '').trim();

    const where: any = {
      source:           'SRM',
      extractionStatus: 'SRM_IMPORT',
    };

    if (search) {
      where.OR = [
        { pptNumber:    { contains: search, mode: 'insensitive' } },
        { designNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (division) {
      where.division = { equals: division, mode: 'insensitive' };
    }

    const [total, records] = await Promise.all([
      prisma.extractionResultFlat.count({ where }),
      prisma.extractionResultFlat.findMany({
        where,
        select: {
          id:               true,
          pptNumber:        true,
          designNumber:     true,
          majorCategory:    true,
          division:         true,
          subDivision:      true,
          vendorCode:       true,
          vendorName:       true,
          imageUrl:         true,
          extractionStatus: true,
          approvalStatus:   true,
          sapSyncStatus:    true,
          createdAt:        true,
          updatedAt:        true,
          aiModel:          true,
          avgConfidence:    true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Summary by division (for the stats cards)
    const divBreakdown = await prisma.extractionResultFlat.groupBy({
      by: ['division'],
      where: { source: 'SRM', extractionStatus: 'SRM_IMPORT' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    res.json({
      success: true,
      data: {
        records,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        divisionBreakdown: divBreakdown.map(d => ({
          division: d.division || 'Unknown',
          count:    d._count.id,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in getSrmFailedExtractions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/srm/failed-extractions/:id/retry
 *
 * Immediately re-runs VLM enrichment for a single SRM_IMPORT record.
 * Returns the updated extractionStatus synchronously (may take ~30s).
 */
export const retrySrmFailedRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { prismaClient: prisma } = await import('../utils/prisma');

    const record = await prisma.extractionResultFlat.findUnique({
      where:  { id },
      select: { id: true, imageUrl: true, majorCategory: true, extractionStatus: true, pptNumber: true, designNumber: true, approvalStatus: true, sapSyncStatus: true },
    });

    if (!record) {
      res.status(404).json({ success: false, error: 'Record not found' });
      return;
    }

    if (!record.imageUrl) {
      res.status(422).json({ success: false, error: 'Record has no image URL — cannot run VLM' });
      return;
    }

    // Guard: do not overwrite data that has already been approved and synced to SAP.
    // The approver reviewed & edited the fields manually; VLM would clobber their work.
    if (record.approvalStatus === 'APPROVED' && record.sapSyncStatus === 'SYNCED') {
      res.status(409).json({
        success: false,
        error:   'Cannot retry: this article is APPROVED and already SYNCED to SAP. VLM extraction would overwrite manually approved data.',
        approvalStatus: record.approvalStatus,
        sapSyncStatus:  record.sapSyncStatus,
      });
      return;
    }

    // Guard: do not touch legacy records created before 25 May 2026.
    // These are correct SRM imports whose data must not be overwritten by re-extraction.
    const SRM_ENRICHMENT_CUTOFF = new Date('2026-05-25T00:00:00.000Z');
    const fullRecord = await prisma.extractionResultFlat.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (fullRecord && fullRecord.createdAt < SRM_ENRICHMENT_CUTOFF) {
      res.status(409).json({
        success: false,
        error:   `Cannot retry: this record was created on ${fullRecord.createdAt.toISOString().slice(0, 10)} (before 2026-05-25). Re-extraction would overwrite the original import data.`,
        createdAt: fullRecord.createdAt,
      });
      return;
    }

    const { enrichSrmRowWithVlmAdmin } = await import('../services/srmSyncService');
    const success = await enrichSrmRowWithVlmAdmin(record.id, record.imageUrl, record.majorCategory);

    const updated = await prisma.extractionResultFlat.findUnique({
      where:  { id },
      select: { extractionStatus: true, articleDescription: true, aiModel: true, avgConfidence: true },
    });

    res.json({
      success,
      id,
      pptNumber:        record.pptNumber,
      designNumber:     record.designNumber,
      extractionStatus: updated?.extractionStatus,
      articleDescription: updated?.articleDescription,
      aiModel:          updated?.aiModel,
      avgConfidence:    updated?.avgConfidence,
      message:          success ? 'VLM enrichment succeeded' : 'VLM enrichment failed — check server logs',
    });
  } catch (error: any) {
    console.error('Error in retrySrmFailedRecord:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/srm/failed-extractions/retry-all
 *
 * Queues VLM re-extraction for ALL current SRM_IMPORT records that have an imageUrl.
 * Responds immediately (202); runs in background.
 *
 * Body (optional): { division?: string } — limit retry to one division
 */
export const retrySrmFailedAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prismaClient: prisma } = await import('../utils/prisma');
    const division = (req.body?.division as string || '').trim() || undefined;

    // Only retry records created on or after 2026-05-25.
    // Legacy records (before this date) are correct SRM imports — re-extraction would overwrite their data.
    const SRM_ENRICHMENT_CUTOFF = new Date('2026-05-25T00:00:00.000Z');

    const where: any = {
      source:           'SRM',
      extractionStatus: 'SRM_IMPORT',
      imageUrl:         { not: null },
      createdAt:        { gte: SRM_ENRICHMENT_CUTOFF },
      // Never touch articles that are already APPROVED + SYNCED to SAP
      NOT: { approvalStatus: 'APPROVED', sapSyncStatus: 'SYNCED' },
    };
    if (division) where.division = { equals: division, mode: 'insensitive' };

    const count = await prisma.extractionResultFlat.count({ where });

    if (count === 0) {
      res.json({ success: true, message: 'No failed records found — nothing to retry.', queued: 0 });
      return;
    }

    res.status(202).json({
      success:  true,
      queued:   count,
      message:  `Retry queued for ${count} record(s). Processing in background — check server logs for progress.`,
    });

    // Run entirely in background
    void (async () => {
      try {
        const records = await prisma.extractionResultFlat.findMany({
          where,
          select: { id: true, imageUrl: true, majorCategory: true },
          orderBy: { createdAt: 'asc' },
        });

        const { enrichSrmRowWithVlmAdmin } = await import('../services/srmSyncService');
        const VLM_DELAY = 2000;
        let enriched = 0;
        let failed   = 0;

        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          if (!rec.imageUrl) continue;
          try {
            const ok = await enrichSrmRowWithVlmAdmin(rec.id, rec.imageUrl, rec.majorCategory);
            if (ok) enriched++; else failed++;
          } catch { failed++; }
          if (i < records.length - 1) await new Promise(r => setTimeout(r, VLM_DELAY));
        }

        console.log(`[Admin] Retry-all complete — enriched:${enriched} failed:${failed} / ${records.length}`);
      } catch (err: any) {
        console.error('[Admin] Retry-all background error:', err?.message);
      }
    })();
  } catch (error: any) {
    console.error('Error in retrySrmFailedAll:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// VENDOR MASTER SYNC (ADMIN)
// ═══════════════════════════════════════════════════════

/**
 * GET /api/admin/vendor-master/status
 * Returns current record count and last sync timestamp.
 */
export const getVendorMasterSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await getVendorMasterStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/vendor-master/sync
 * Triggers an immediate full sync from the DAB API.
 * Runs in the background — responds immediately with 202 Accepted.
 */
export const triggerVendorMasterSync = async (req: Request, res: Response): Promise<void> => {
  try {
    // Acknowledge immediately so the HTTP request doesn't time out mid-sync
    res.status(202).json({
      success: true,
      message: 'Vendor master sync started in background. Check server logs for progress.',
    });

    // Fire-and-forget
    syncVendorMaster()
      .then(r =>
        console.log(`[Admin] Vendor master sync complete — upserted:${r.upserted} pages:${r.pages} duration:${r.durationMs}ms`)
      )
      .catch(err =>
        console.error('[Admin] Vendor master sync failed:', err?.message)
      );
  } catch (error: any) {
    console.error('Error in triggerVendorMasterSync:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════
// MAJ-CAT GRID — Excel Upload, Serve & Template
// ═══════════════════════════════════════════════════════

/**
 * GET /api/admin/majcat-grid/template
 * Streams a ready-to-fill Excel template with headers + sample rows.
 */
export const downloadMajCatGridTemplate = async (_req: Request, res: Response): Promise<void> => {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Article Creation System';
    wb.created = new Date();

    const ws = wb.addWorksheet('MAJ_CAT_GRID');

    // Row 1 — Title
    ws.mergeCells('A1:J1');
    const title = ws.getCell('A1');
    title.value = '300 MAJOR CATEGORY WISE ACTIVE GRID MASTER';
    title.font = { bold: true, size: 13, color: { argb: 'FF1D3557' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    ws.getRow(1).height = 28;

    // Row 2 — blank
    ws.addRow([]);

    // Row 3 — Headers
    const HEADERS = [
      'FG_MAJ_CAT', 'F.GRD SR NO', 'FATHER COMP DIV', 'CHILD GRID SR NO',
      'FATHER COMP MAJ_CAT', 'MVGR GRID SR NO', 'MAIN MVGR',
      'FULL FORM', 'GRID STATUS', 'RECEIVED/AUTO',
    ];
    const REQUIRED_COLS = [0, 4, 6]; // A, E, G — used by the uploader

    const headerRow = ws.addRow(HEADERS);
    headerRow.eachCell((cell, colNum) => {
      const isRequired = REQUIRED_COLS.includes(colNum - 1);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isRequired ? 'FF1D6F42' : 'FF2F5496' },
      };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(3).height = 32;

    // Row 4 — blank (data starts at row 5 to match original format)
    ws.addRow([]);

    // Sample rows
    const SAMPLES = [
      ['JB_TEES_FS', '1', 'FAB', '1.05', 'WEAVE-01',        '1.05.54',  'B_EYE',     'BIRD EYE',        'ACT', 'AUTO'],
      ['JB_TEES_FS', '1', 'FAB', '1.05', 'WEAVE-01',        '1.05.150', 'CNVS',      'CANVAS',          'ACT', 'AUTO'],
      ['JB_TEES_FS', '1', 'FAB', '1.05', 'M_YARN',          '1.01.10',  'COTTON',    'COTTON',          'ACT', 'AUTO'],
      ['JB_TEES_FS', '1', 'FAB', '1.05', 'M_YARN',          '1.01.20',  'POLYESTER', 'POLYESTER',       'ACT', 'AUTO'],
      ['L_PLAZO',    '2', 'FAB', '2.01', 'M_FAB_DIV',       '2.01.01',  'K',         'KNIT',            'ACT', 'AUTO'],
      ['L_PLAZO',    '2', 'FAB', '2.01', 'M_FAB_DIV',       '2.01.02',  'W',         'WOVEN',           'ACT', 'AUTO'],
      ['L_PLAZO',    '2', 'FAB', '2.01', 'M_FAB_DIV',       '2.01.03',  'DNM',       'DENIM',           'ACT', 'AUTO'],
      ['M_TEES_HS',  '3', 'FAB', '3.01', 'WEAVE-01',        '3.01.01',  'SJ',        'SINGLE JERSEY',   'ACT', 'AUTO'],
      ['M_TEES_HS',  '3', 'FAB', '3.01', 'WEAVE-01',        '3.01.02',  'PIQ',       'PIQUE',           'ACT', 'AUTO'],
      ['M_TEES_HS',  '3', 'FAB', '3.01', 'FAB_MAIN_MVGR-1', '3.02.01',  'SLD',       'SOLID',           'ACT', 'AUTO'],
    ];

    SAMPLES.forEach((row, i) => {
      const r = ws.addRow(row);
      r.eachCell((cell, colNum) => {
        const isRequired = REQUIRED_COLS.includes(colNum - 1);
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' },
        };
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: i % 2 === 0 ? 'FFF2F7FF' : 'FFFFFFFF' },
        };
        if (isRequired) cell.font = { bold: true };
      });
    });

    // Column widths
    [18, 12, 16, 16, 22, 16, 14, 22, 14, 16].forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // Note row
    ws.addRow([]);
    const noteRowNum = ws.rowCount + 1;
    ws.addRow([
      '⚠ NOTE: Data must start from Row 5. ' +
      'Columns A (FG_MAJ_CAT ✱), E (FATHER COMP MAJ_CAT ✱), G (MAIN MVGR ✱) are REQUIRED. ' +
      'Green headers = required by uploader. Blue headers = optional (can be left blank).',
    ]);
    ws.mergeCells(`A${noteRowNum}:J${noteRowNum}`);
    const noteCell = ws.getCell(`A${noteRowNum}`);
    noteCell.font = { italic: true, size: 10, color: { argb: 'FF595959' } };
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    noteCell.alignment = { wrapText: true };
    ws.getRow(noteRowNum).height = 36;

    // Stream to response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MAJ_CAT_GRID_TEMPLATE.xlsx"');

    await wb.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('[MajCatGrid] Template generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Meta file only stores upload info (filename, date) — actual values live in Supabase
const MAJ_CAT_META_FILE = path.join(process.cwd(), 'data', 'majCatGridMeta.json');

/**
 * GET /api/admin/majcat-grid/status
 * Returns metadata about the last uploaded grid + live row counts from Supabase.
 */
export const getMajCatGridStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Live counts from DB
    const countResult = await prisma.$queryRaw<{ total: bigint; categories: bigint; attributes: bigint }[]>`
      SELECT
        COUNT(*)                                         AS total,
        COUNT(DISTINCT major_category)                   AS categories,
        COUNT(DISTINCT (major_category || '||' || attribute_name)) AS attributes
      FROM maj_cat_grid_values
    `;
    const { total, categories, attributes } = countResult[0];

    // Upload metadata from file (lightweight)
    let fileMeta: Record<string, any> = {};
    if (fs.existsSync(MAJ_CAT_META_FILE)) {
      try { fileMeta = JSON.parse(fs.readFileSync(MAJ_CAT_META_FILE, 'utf-8')); } catch {}
    }

    if (Number(total) === 0 && !fileMeta.uploadedAt) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({
      success: true,
      data: {
        ...fileMeta,
        totalValues:      Number(total),
        categoriesCount:  Number(categories),
        attributesCount:  Number(attributes),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/admin/majcat-grid/values
 * Reads all rows from Supabase and returns grouped JSON for frontend caching.
 * Format: { [majorCategory]: { [attributeName]: string[] } }
 */
export const getMajCatGridValues = async (req: Request, res: Response): Promise<void> => {
  try {
    // Optional ?majorCategory=XYZ — return grid values for ONLY that major
    // category (used by the article card so it doesn't pull the entire grid).
    // No param → full grid (used by admin pages, back-compat).
    const majorCategory = ((req.query.majorCategory as string) || '').trim();

    const rows = majorCategory
      ? await prisma.$queryRaw<{ major_category: string; attribute_name: string; value: string }[]>`
          SELECT major_category, attribute_name, value
          FROM maj_cat_grid_values
          WHERE UPPER(TRIM(major_category)) = ${majorCategory.toUpperCase()}
          ORDER BY attribute_name, value
        `
      : await prisma.$queryRaw<{ major_category: string; attribute_name: string; value: string }[]>`
          SELECT major_category, attribute_name, value
          FROM maj_cat_grid_values
          ORDER BY major_category, attribute_name, value
        `;

    // Group into nested object
    const grouped: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      if (!grouped[row.major_category]) grouped[row.major_category] = {};
      if (!grouped[row.major_category][row.attribute_name]) grouped[row.major_category][row.attribute_name] = [];
      grouped[row.major_category][row.attribute_name].push(row.value);
    }

    res.json({ success: true, data: grouped });
  } catch (error: any) {
    console.error('[MajCatGrid] Values fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/majcat-grid/upload
 * Accepts a multipart Excel file, parses cols A (FG_MAJ_CAT), E (attr name), G (value),
 * truncates the maj_cat_grid_values table, then batch-inserts into Supabase.
 */
export const uploadMajCatGrid = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded. Send a .xlsx file as "file" field.' });
      return;
    }

    // ── 1. Parse Excel ──────────────────────────────────────────────────────────
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(req.file.buffer as any);

    const ws = wb.worksheets[0];
    if (!ws) {
      res.status(400).json({ success: false, error: 'No worksheets found in the uploaded Excel file.' });
      return;
    }

    const COL_MAJ_CAT = 1; // A — FG_MAJ_CAT
    const COL_ATTR    = 5; // E — FATHER COMP MAJ_CAT
    const COL_VALUE   = 7; // G — MAIN MVGR
    const COL_STATUS  = 9; // I — GRID STATUS  (only import "ACT" rows)

    // Deduplicate with a Set keyed by "mc||at||v"
    const seen = new Set<string>();
    type GridRow = { major_category: string; attribute_name: string; value: string };
    const flatRows: GridRow[] = [];
    let skipped = 0;
    let inactiveSkipped = 0;

    for (let r = 5; r <= ws.rowCount; r++) {
      const row    = ws.getRow(r);
      const mc     = String(row.getCell(COL_MAJ_CAT).value ?? '').trim();
      const at     = String(row.getCell(COL_ATTR).value    ?? '').trim();
      const v      = String(row.getCell(COL_VALUE).value   ?? '').trim();
      const status = String(row.getCell(COL_STATUS).value  ?? '').trim().toUpperCase();

      if (!mc || !at || !v) { skipped++; continue; }

      // Skip inactive rows — only import ACT (active) values
      if (status && status !== 'ACT') { inactiveSkipped++; continue; }

      const key = `${mc}||${at}||${v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flatRows.push({ major_category: mc, attribute_name: at, value: v });
    }

    const totalRows       = flatRows.length;
    const categoriesCount = new Set(flatRows.map(r => r.major_category)).size;
    const attributesCount = new Set(flatRows.map(r => `${r.major_category}||${r.attribute_name}`)).size;

    // ── 2. Replace all rows in Supabase ────────────────────────────────────────
    // Use a larger batch size (5000) to cut DB round-trips from ~637 → ~64 for
    // a 318k-row file. Wrapped in a single transaction so either all rows land
    // or none do (no partial state on failure).
    const BATCH = 5000;
    console.log(`[MajCatGrid] Replacing table — ${totalRows} rows in batches of ${BATCH}...`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`TRUNCATE TABLE maj_cat_grid_values RESTART IDENTITY`;

      for (let i = 0; i < flatRows.length; i += BATCH) {
        const batch = flatRows.slice(i, i + BATCH);
        await tx.$executeRaw`
          INSERT INTO maj_cat_grid_values (major_category, attribute_name, value, uploaded_at)
          SELECT v.major_category, v.attribute_name, v.value, NOW()
          FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
            AS v(major_category text, attribute_name text, value text)
          ON CONFLICT (major_category, attribute_name, value) DO NOTHING
        `;
      }
    }, { timeout: 14 * 60 * 1000 }); // 14-min DB transaction timeout (just under request timeout)

    // ── 3. Save lightweight metadata file ──────────────────────────────────────
    const meta = {
      uploadedAt:       new Date().toISOString(),
      fileName:         req.file.originalname,
      totalRows,
      skippedRows:      skipped,
      inactiveSkipped,
      categoriesCount,
      attributesCount,
    };
    const metaDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(MAJ_CAT_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');

    // Flush the RFC service cache so next SAP sync uses the freshly uploaded grid
    invalidateMajCatVisibleCache();
    invalidateFieldVisibilityCache(); // also flush description-builder collar visibility cache

    console.log(`[MajCatGrid] Done — ${totalRows} ACT rows inserted, ${inactiveSkipped} IN-ACT skipped, ${categoriesCount} major categories, ${attributesCount} attr slots`);

    res.json({
      success: true,
      message: `Grid uploaded successfully. Inserted ${totalRows} rows across ${categoriesCount} major categories into Supabase.`,
      data: meta,
    });
  } catch (error: any) {
    console.error('[MajCatGrid] Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MANDATORY GRID (maj_cat_mandatory_grid)
// ═══════════════════════════════════════════════════════════════════════════════

const MAJ_CAT_MANDATORY_META_FILE = path.join(process.cwd(), 'data', 'majCatMandatoryMeta.json');

/**
 * GET /api/admin/mandatory-grid/status
 */
export const getMandatoryGridStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const countResult = await prisma.$queryRaw<{ total: bigint; categories: bigint; active: bigint }[]>`
      SELECT
        COUNT(*)                             AS total,
        COUNT(DISTINCT major_category)       AS categories,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active
      FROM maj_cat_mandatory_grid
    `;
    const { total, categories, active } = countResult[0];

    let fileMeta: Record<string, any> = {};
    if (fs.existsSync(MAJ_CAT_MANDATORY_META_FILE)) {
      try { fileMeta = JSON.parse(fs.readFileSync(MAJ_CAT_MANDATORY_META_FILE, 'utf-8')); } catch {}
    }

    if (Number(total) === 0 && !fileMeta.uploadedAt) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({
      success: true,
      data: {
        ...fileMeta,                              // includes totalRows (Excel row count), attributesCount
        categoriesCount: Number(categories),      // authoritative from DB (distinct major categories)
        activeMappings:  Number(active),          // active (major_category, sap_key) pairs in DB
        totalMappings:   Number(total),           // total (major_category, sap_key) pairs in DB
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/admin/mandatory-grid/values
 * Returns: { [majorCategory]: { sapKey: boolean } }
 */
export const getMandatoryGridValues = async (req: Request, res: Response): Promise<void> => {
  try {
    // Optional ?majorCategory=XYZ — return mandatory-grid rows for ONLY that
    // major category (used by the article card so it doesn't pull the whole
    // table). No param → full grid (admin pages, back-compat).
    const majorCategory = ((req.query.majorCategory as string) || '').trim();

    const rows = majorCategory
      ? await prisma.$queryRaw<{ major_category: string; sap_key: string; label: string | null; is_active: boolean }[]>`
          SELECT major_category, sap_key, label, is_active
          FROM maj_cat_mandatory_grid
          WHERE UPPER(TRIM(major_category)) = ${majorCategory.toUpperCase()}
          ORDER BY sap_key
        `
      : await prisma.$queryRaw<{ major_category: string; sap_key: string; label: string | null; is_active: boolean }[]>`
          SELECT major_category, sap_key, label, is_active
          FROM maj_cat_mandatory_grid
          ORDER BY major_category, sap_key
        `;

    const grouped: Record<string, Record<string, { isActive: boolean; label: string | null }>> = {};
    for (const row of rows) {
      if (!grouped[row.major_category]) grouped[row.major_category] = {};
      grouped[row.major_category][row.sap_key] = {
        isActive: row.is_active,
        label: row.label ?? null,
      };
    }

    res.json({ success: true, data: grouped });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/admin/mandatory-grid/template
 */
export const downloadMandatoryGridTemplate = async (_req: Request, res: Response): Promise<void> => {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('MANDATORY-GRID-TEMPLATE');

    // Title
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'MAJOR CATEGORY WISE MANDATORY GRID DATA';
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 22;

    // Row 2 empty
    ws.addRow([]);

    // Row 3 — SAP Keys header
    const sapKeys = [
      'DIV', 'SUB-DIV', 'MAJOR_CATEGORY',
      'M_FAB_DIV', 'M_YARN', 'M_YARN-02', 'M_WEAVE_2', 'M_FAB', 'M_FAB2',
      'M_COMPOSITION', 'M_COUNT', 'M_CONSTRUCTION', 'M_LYCRA', 'M_FINISH',
      'M_GSM', 'M_OUNZ', 'M_WIDTH', 'M_COLLAR', 'M_COLLAR_STYLE',
      'M_NECK_BAND_STYLE', 'M_NECK_BAND', 'M_PLACKET', 'M_BLT_MAIN_STYLE',
      'M_SUB_STYLE_BLT', 'M_SLEEVES_MAIN_STYLE', 'M_SLEEVE_FOLD', 'M_BTM_FOLD',
      'M_NO_OF_POCKET', 'M_POCKET', 'M_EXTRA_POCKET', 'M_FIT', 'M_PATTERN',
      'M_LENGTH', 'M_DC_SUB_STYLE', 'M_DC_SHAPE', 'M_BTN_MAIN_MVGR', 'M_BTN_CLR',
      'M_ZIP', 'M_ZIP_COL', 'M_PATCH_TYPE', 'M_PATCHES', 'M_HTRF_STYLE',
      'M_HTRF_TYPE', 'M_PRINT_TYPE', 'M_PRINT_STYLE', 'M_PRINT_PLACEMENT',
      'M_EMBROIDERY', 'M_EMB_TYPE', 'M_EMB_PLACEMENT', 'M_WASH',
      'M_AGE_GROUP', 'PRICE_BAND_CATEGORY', 'FASHION_GRADE', 'PURCH_PRICE', 'MRP',
      'VENDOR-NM', 'G_WEIGHT', 'ARTICLE DIMENSION',
    ];

    const row3 = ws.addRow(sapKeys);
    row3.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Row 4 — Labels header
    const labels = [
      'DIV', 'SUB-DIV', 'MAJOR_CATEGORY',
      'M_FAB_DIV', 'M_YARN', 'FAB_MAIN_MVGR-1', 'FAB-MAIN-MVGR-2', 'WEAVE-01', 'WEAVE 02',
      'M_COMPOSITION', 'M_COUNT', 'M_CONSTRUCTION', 'M_LYCRA', 'M_FINISH',
      'M_GSM', 'M_OUNZ', 'M_WIDTH', 'M_COLLAR_TYPE', 'M_COLLAR_STYLE',
      'M_NECK_STYLE', 'M_NECK_TYPE', 'M_PLACKET', 'M_BLT_TYPE',
      'M_BLT_STYLE', 'M_SLEEVES_MAIN_STYLE', 'M_SLEEVE_FOLD', 'M_BTM_FOLD',
      'M_NO_OF_POCKET', 'M_POCKET', 'M_EXTRA_POCKET', 'M_FIT', 'BODY STYLE',
      'M_LENGTH', 'M_DC_STYLE', 'M_DC_SHAPE', 'M_BTN_TYPE', 'M_BTN_CLR',
      'M_ZIP_TYPE', 'M_ZIP_COL', 'M_PATCH_STYLE', 'M_PATCHE_TYPE', 'M_HTRF_STYLE',
      'M_HTRF_TYPE', 'M_PRINT_TYPE', 'M_PRINT_STYLE', 'M_PRINT_PLACEMENT',
      'M_EMBROIDERY_STYLE', 'M_EMB_TYPE', 'M_EMB_PLACEMENT', 'M_WASH',
      'AGE GROUP', 'SEGMENT', 'ARTICLE FASHION TYPE', 'COST', 'MRP',
      'VENDOR-NM', 'ARTICLE WEIGHT', 'ARTICLE DIMENSION',
    ];

    const row4 = ws.addRow(labels);
    row4.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBDEFB' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Row 5 empty + sample row 6
    ws.addRow([]);
    ws.addRow(['MENS', 'MW', 'MW_TEES_FS', 1, 1, 1, 1, 1, 1, 1, null, null, 1, null, 1, null, null, null, null, 1, 1, null, null, null, 1, 1, 1, 1, 1, null, 1, null, 1, null, null, null, null, null, null, null, null, null, null, 1, 1, 1, null, null, null, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

    // Note
    ws.addRow([]);
    const noteRow = ws.addRow(['⚠ NOTE: Row 3 = SAP Keys, Row 4 = Labels, Row 5 = empty, Row 6+ = data. Use 1 for active/visible, leave blank for inactive/hidden.']);
    ws.mergeCells(`A${noteRow.number}:BF${noteRow.number}`);
    noteRow.getCell(1).font = { italic: true, size: 10 };
    noteRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MANDATORY_GRID_TEMPLATE.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('[MandatoryGrid] Template error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/mandatory-grid/upload
 */
export const uploadMandatoryGrid = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];

    // Row 3 = SAP keys, Row 4 = labels, Row 5 = empty, Row 6+ = data
    const sapKeyRow = ws.getRow(3);
    const labelRow  = ws.getRow(4);

    // Build column index → { sapKey, label }
    const colMeta: Record<number, { sapKey: string; label: string }> = {};
    sapKeyRow.eachCell({ includeEmpty: false }, (cell: any, col: number) => {
      if (col <= 3) return; // skip DIV, SUB-DIV, MAJOR_CATEGORY
      const rawSap = cell.value;
      // Handle formula cells
      const sapKey = typeof rawSap === 'object' && rawSap !== null && 'result' in rawSap
        ? String(rawSap.result).trim()
        : String(rawSap ?? '').trim();
      if (!sapKey) return;

      const rawLabel = labelRow.getCell(col).value;
      const label = typeof rawLabel === 'object' && rawLabel !== null && 'result' in rawLabel
        ? String(rawLabel.result).trim()
        : String(rawLabel ?? '').trim();

      colMeta[col] = { sapKey, label };
    });

    console.log(`[MandatoryGrid] Detected ${Object.keys(colMeta).length} attribute columns`);

    // Parse data rows (row 6+)
    type FlatRecord = {
      major_category: string;
      div: string | null;
      sub_div: string | null;
      sap_key: string;
      label: string | null;
      is_active: boolean;
    };

    const flatRows: FlatRecord[] = [];
    let skipped = 0;

    ws.eachRow({ includeEmpty: false }, (row: any, rowNum: number) => {
      if (rowNum <= 5) return; // skip header rows

      const rawMajCat = row.getCell(3).value;
      const majorCategory = String(rawMajCat ?? '').trim();
      if (!majorCategory) { skipped++; return; }

      const div    = String(row.getCell(1).value ?? '').trim() || null;
      const subDiv = String(row.getCell(2).value ?? '').trim() || null;

      for (const [colStr, { sapKey, label }] of Object.entries(colMeta)) {
        const col = Number(colStr);
        const cellVal = row.getCell(col).value;
        const isActive = cellVal === 1 || cellVal === '1' || cellVal === true;
        flatRows.push({ major_category: majorCategory, div, sub_div: subDiv, sap_key: sapKey, label, is_active: isActive });
      }
    });

    const totalRows = flatRows.length;
    const categoriesCount = new Set(flatRows.map(r => r.major_category)).size;
    const activeCount = flatRows.filter(r => r.is_active).length;

    console.log(`[MandatoryGrid] Parsed ${totalRows} records, ${categoriesCount} categories, ${activeCount} active`);

    // TRUNCATE + batch INSERT
    await prisma.$executeRaw`TRUNCATE TABLE maj_cat_mandatory_grid RESTART IDENTITY`;

    const BATCH = 500;
    for (let i = 0; i < flatRows.length; i += BATCH) {
      const batch = flatRows.slice(i, i + BATCH);
      const values = batch.map(r =>
        `(${[
          `'${r.major_category.replace(/'/g, "''")}'`,
          r.div    ? `'${r.div.replace(/'/g, "''")}'`    : 'NULL',
          r.sub_div ? `'${r.sub_div.replace(/'/g, "''")}'` : 'NULL',
          `'${r.sap_key.replace(/'/g, "''")}'`,
          r.label  ? `'${r.label.replace(/'/g, "''")}'`  : 'NULL',
          r.is_active ? 'true' : 'false',
          'NOW()',
        ].join(',')})`
      ).join(',');

      await prisma.$executeRawUnsafe(`
        INSERT INTO maj_cat_mandatory_grid
          (major_category, div, sub_div, sap_key, label, is_active, uploaded_at)
        VALUES ${values}
        ON CONFLICT (major_category, sap_key) DO UPDATE SET
          div        = EXCLUDED.div,
          sub_div    = EXCLUDED.sub_div,
          label      = EXCLUDED.label,
          is_active  = EXCLUDED.is_active,
          uploaded_at = NOW()
      `);
    }

    // Save meta
    const meta = {
      uploadedAt:      new Date().toISOString(),
      fileName:        req.file.originalname,
      totalRows:       categoriesCount,                  // Excel data rows = distinct major categories
      attributesCount: Object.keys(colMeta).length,     // number of SAP key columns in Excel
      activeMappings:  activeCount,                     // active (major_category, sap_key) pairs
      totalMappings:   totalRows,                       // total (major_category, sap_key) pairs
      categoriesCount,
      skippedRows:     skipped,
    };
    const metaDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(MAJ_CAT_MANDATORY_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');

    // Flush the RFC service cache so next SAP sync uses the freshly uploaded grid
    invalidateMandatoryGridCache();
    invalidateFieldVisibilityCache(); // also flush description-builder collar visibility cache

    console.log(`[MandatoryGrid] Done — ${categoriesCount} major categories, ${Object.keys(colMeta).length} SAP columns, ${activeCount} active mappings`);

    res.json({
      success: true,
      message: `Mandatory grid uploaded. ${categoriesCount} major categories × ${Object.keys(colMeta).length} attribute columns = ${activeCount} active field mappings.`,
      data: meta,
    });
  } catch (error: any) {
    console.error('[MandatoryGrid] Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HIERARCHY EXCEL UPLOAD
// Reads DIV / SUB-DIV / MAJOR_CATEGORY columns from the Mandatory Grid Excel
// and upserts rows into departments, sub_departments, categories tables.
// ═══════════════════════════════════════════════════════════════════════════════

/** Compact Excel sub-div codes → normalised DB codes */
const SUB_DIV_NORMALIZE: Record<string, string> = {
  KGU:    'KG-U',
  KGWU:   'KGW-U',
  KBU:    'KB-U',
  KBWU:   'KBW-U',
  KGL:    'KG-L',
  KGWL:   'KGW-L',
  KBL:    'KB-L',
  KBWL:   'KBW-L',
  KBSETS: 'KB-SETS',
  KBWSETS:'KBW-SETS',
  MSU:    'MS-U',
  MSL:    'MS-L',
  MSIW:   'MS-IW',
};

function normalizeSubDiv(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return SUB_DIV_NORMALIZE[upper] ?? raw.trim();
}

interface HierarchyRow {
  div: string;
  subDiv: string;
  majorCategory: string;
}

interface HierarchyUploadResult {
  departments:    { new: number; updated: number; total: number };
  subDepartments: { new: number; updated: number; total: number };
  categories:     { new: number; updated: number; total: number };
  skippedRows:    number;
  dryRun:         boolean;
  preview?: {
    divisions:      string[];
    subDivisions:   string[];
    majorCategories: string[];
  };
}

/**
 * GET /api/admin/hierarchy/upload-excel/status
 * Returns summary counts from the three hierarchy tables.
 */
export const getHierarchyExcelStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [depts, subs, cats] = await Promise.all([
      prisma.department.count({ where: { isActive: true } }),
      prisma.subDepartment.count({ where: { isActive: true } }),
      prisma.category.count({ where: { isActive: true } }),
    ]);
    res.json({ success: true, data: { departments: depts, subDepartments: subs, categories: cats } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/admin/hierarchy/upload-excel
 * ?dryRun=true  → parse only, return preview without saving
 */
export const uploadHierarchyExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const dryRun = req.query.dryRun === 'true';

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) {
      res.status(400).json({ success: false, error: 'Excel file has no worksheets' });
      return;
    }

    // Parse rows — DIV=col1, SUB-DIV=col2, MAJOR_CATEGORY=col3
    // Row 1: title, Row 2: blank, Row 3: primary headers, Row 4: SAP keys, Row 5: blank, Row 6+: data
    const rows: HierarchyRow[] = [];
    let skippedRows = 0;

    ws.eachRow({ includeEmpty: false }, (row: any, rowNum: number) => {
      if (rowNum <= 5) return; // skip header block

      const rawDiv = row.getCell(1).value;
      const rawSub = row.getCell(2).value;
      const rawCat = row.getCell(3).value;

      const div          = String(rawDiv ?? '').trim().toUpperCase();
      const subDivRaw    = String(rawSub ?? '').trim();
      const majorCategory = String(rawCat ?? '').trim();

      if (!div || !subDivRaw || !majorCategory) { skippedRows++; return; }

      rows.push({ div, subDiv: normalizeSubDiv(subDivRaw), majorCategory });
    });

    // Deduplicate
    const uniqueDivs    = [...new Set(rows.map(r => r.div))];
    const uniqueSubDivs = [...new Set(rows.map(r => `${r.div}||${r.subDiv}`))];
    const uniqueCats    = [...new Set(rows.map(r => r.majorCategory))];

    console.log(`[HierarchyExcel] Parsed ${rows.length} rows → ${uniqueDivs.length} divs, ${uniqueSubDivs.length} sub-divs, ${uniqueCats.length} major categories, ${skippedRows} skipped`);

    // ── Dry run: return preview only ────────────────────────────────────────────
    if (dryRun) {
      const result: HierarchyUploadResult = {
        departments:    { new: 0, updated: 0, total: uniqueDivs.length },
        subDepartments: { new: 0, updated: 0, total: uniqueSubDivs.length },
        categories:     { new: 0, updated: 0, total: uniqueCats.length },
        skippedRows,
        dryRun: true,
        preview: {
          divisions:      uniqueDivs,
          subDivisions:   [...new Set(rows.map(r => r.subDiv))].sort(),
          majorCategories: uniqueCats,
        },
      };
      res.json({ success: true, data: result });
      return;
    }

    // ── Real upsert ──────────────────────────────────────────────────────────────
    const deptStats = { new: 0, updated: 0 };
    const subStats  = { new: 0, updated: 0 };
    const catStats  = { new: 0, updated: 0 };

    // 1. Upsert Departments — case-insensitive lookup to avoid creating duplicates
    //    (e.g. "Kids" already in DB + "KIDS" from Excel → same record)
    const deptMap = new Map<string, number>(); // code → id
    for (const divCode of uniqueDivs) {
      const existing = await prisma.department.findFirst({
        where: { code: { equals: divCode, mode: 'insensitive' } },
      });
      if (existing) {
        // Normalise the stored code to uppercase
        await prisma.department.update({
          where: { id: existing.id },
          data: { code: divCode, name: divCode, isActive: true },
        });
        deptMap.set(divCode, existing.id);
        deptStats.updated++;
      } else {
        const created = await prisma.department.create({
          data: { code: divCode, name: divCode, displayOrder: 0, isActive: true },
        });
        deptMap.set(divCode, created.id);
        deptStats.new++;
      }
    }

    // 2. Upsert SubDepartments
    const subMap = new Map<string, number>(); // "div||subDiv" → id
    const subDivPairs = [...new Map(rows.map(r => [`${r.div}||${r.subDiv}`, r])).values()];
    for (const { div, subDiv } of subDivPairs) {
      const departmentId = deptMap.get(div);
      if (!departmentId) continue;
      const key = `${div}||${subDiv}`;

      const existing = await prisma.subDepartment.findFirst({
        where: { departmentId, code: subDiv },
      });
      if (existing) {
        await prisma.subDepartment.update({
          where: { id: existing.id },
          data: { name: subDiv, isActive: true },
        });
        subMap.set(key, existing.id);
        subStats.updated++;
      } else {
        const created = await prisma.subDepartment.create({
          data: { departmentId, code: subDiv, name: subDiv, displayOrder: 0, isActive: true },
        });
        subMap.set(key, created.id);
        subStats.new++;
      }
    }

    // 3. Upsert Categories
    for (const { div, subDiv, majorCategory } of rows) {
      const subDepartmentId = subMap.get(`${div}||${subDiv}`);
      if (!subDepartmentId) continue;

      const existing = await prisma.category.findUnique({ where: { code: majorCategory } });
      if (existing) {
        await prisma.category.update({
          where: { id: existing.id },
          data: { subDepartmentId, name: majorCategory, isActive: true },
        });
        catStats.updated++;
      } else {
        await prisma.category.create({
          data: { subDepartmentId, code: majorCategory, name: majorCategory, displayOrder: 0, isActive: true },
        });
        catStats.new++;
      }
    }

    const result: HierarchyUploadResult = {
      departments:    { ...deptStats, total: uniqueDivs.length },
      subDepartments: { ...subStats,  total: uniqueSubDivs.length },
      categories:     { ...catStats,  total: uniqueCats.length },
      skippedRows,
      dryRun: false,
    };

    console.log(`[HierarchyExcel] Done — Depts: +${deptStats.new}/~${deptStats.updated}, SubDepts: +${subStats.new}/~${subStats.updated}, Cats: +${catStats.new}/~${catStats.updated}`);

    res.json({
      success: true,
      message: `Hierarchy updated — ${deptStats.new} new / ${deptStats.updated} existing departments, ${subStats.new} new / ${subStats.updated} existing sub-divisions, ${catStats.new} new / ${catStats.updated} existing major categories.`,
      data: result,
    });
  } catch (error: any) {
    console.error('[HierarchyExcel] Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
