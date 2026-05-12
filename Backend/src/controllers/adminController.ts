/**
 * Admin Controller - Hierarchy Management APIs
 * Complete CRUD operations for managing the fashion hierarchy
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { prismaClient as prisma, withPrismaRetry } from '../utils/prisma';
import bcrypt from 'bcryptjs';

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
  role: z.enum(['ADMIN', 'USER', 'CREATOR', 'PO_COMMITTEE', 'APPROVER', 'CATEGORY_HEAD', 'SUB_DIVISION_HEAD']).optional().default('USER'),
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

    await prisma.subDepartment.delete({
      where: { id: parseInt(id) },
    });

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

    await prisma.category.delete({
      where: { id: parseInt(id) },
    });

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
                      include: {
                        allowedValues: {
                          where: { isActive: true },
                          orderBy: { displayOrder: 'asc' },
                        },
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
 * Get total number of images used for attribute extraction
 * Counts unique images and groups by status, category, date
 */
export const getImageUsageAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo, status, categoryId } = req.query;

    // Build where clause
    const where: any = {};

    // Filter by date range if provided
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo as string);
      }
    }

    // Filter by status if provided
    if (status) {
      where.status = status as string;
    }

    // Filter by category if provided
    if (categoryId) {
      where.categoryId = parseInt(categoryId as string);
    }

    // Get extraction jobs for full filtered dataset
    const jobs = await prisma.extractionJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        imageUrl: true,
        imageHash: true,
        status: true,
        createdAt: true,
        categoryId: true,
        category: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    // Count unique images by hash (if available) or URL
    const uniqueImages = new Set(jobs.map((job) => job.imageHash || job.imageUrl));

    // Group by status
    const statusBreakdown: any = {};
    jobs.forEach((job) => {
      if (!statusBreakdown[job.status]) {
        statusBreakdown[job.status] = 0;
      }
      statusBreakdown[job.status] += 1;
    });

    // Group by category
    const categoryBreakdown: any = {};
    jobs.forEach((job) => {
      const categoryKey = `${job.category.code} (${job.category.name})`;
      if (!categoryBreakdown[categoryKey]) {
        categoryBreakdown[categoryKey] = 0;
      }
      categoryBreakdown[categoryKey] += 1;
    });

    // Daily breakdown for last 30 days
    const dailyBreakdown: any = {};
    jobs.forEach((job) => {
      const date = new Date(job.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD format
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = 0;
      }
      dailyBreakdown[date] += 1;
    });

    res.json({
      success: true,
      data: {
        totalImages: jobs.length,
        uniqueImages: uniqueImages.size,
        averageImagesPerDay: (jobs.length / Math.max(Object.keys(dailyBreakdown).length, 1)).toFixed(2),
        statusBreakdown,
        categoryBreakdown,
        dailyBreakdown: Object.entries(dailyBreakdown)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .reduce((acc: Record<string, number>, [date, count]) => {
            acc[date] = count as number;
            return acc;
          }, {} as Record<string, number>),
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
      // Records currently hidden from approvers because extraction is still running (<4h old)
      prisma.extractionResultFlat.count({
        where: {
          source: 'SRM',
          extractionStatus: 'SRM_IMPORT',
          createdAt: { gt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
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
  try {
    const { syncFromSrm } = await import('../services/srmSyncService');
    console.log('[Admin] Manual SRM sync triggered');
    const result = await syncFromSrm();
    console.log(`[Admin] Manual SRM sync complete — inserted:${result.inserted} skipped:${result.skipped} errors:${result.errors}`);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in triggerSrmSync:', error);
    res.status(500).json({ success: false, error: error.message });
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
