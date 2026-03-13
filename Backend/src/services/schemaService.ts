import { prismaClient as prisma } from '../utils/prisma';

export class SchemaService {
  private prisma = prisma;

  /**
   * Load category schema from database
   * Returns category info + attributes with allowed values
   */
  async getCategorySchema(categoryCode: string) {
    const category = await this.prisma.category.findUnique({
      where: { code: categoryCode },
      include: {
        subDepartment: {
          include: { department: true }
        },
        attributes: {
          where: { isEnabled: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            attribute: {
              include: {
                allowedValues: {
                  where: { isActive: true },
                  orderBy: { displayOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });

    if (!category) {
      throw new Error(`Category with code '${categoryCode}' not found`);
    }

    // Transform to extraction schema format (compatible with existing VLM service)
    const schema = category.attributes.map(ca => ({
      key: ca.attribute.key,
      label: ca.attribute.label,
      type: ca.attribute.type.toLowerCase() as 'text' | 'select' | 'number' | 'boolean',
      allowedValues: ca.attribute.allowedValues.map(av => av.shortForm),
      
      // Extended info for frontend/analytics
      _metadata: {
        attributeId: ca.attribute.id,
        aiExtractable: ca.attribute.aiExtractable,
        visibleFromDistance: ca.attribute.visibleFromDistance,
        extractionPriority: ca.attribute.extractionPriority,
        confidenceThreshold: ca.attribute.confidenceThreshold?.toString() || '0.70',
        category: ca.attribute.category,
        isRequired: ca.isRequired,
        defaultValue: ca.defaultValue,
        allowedValuesDetail: ca.attribute.allowedValues.map(av => ({
          id: av.id,
          shortForm: av.shortForm,
          fullForm: av.fullForm,
          aliases: av.aliases
        }))
      }
    }));

    return {
      category: {
        id: category.id,
        code: category.code,
        name: category.name,
        fullForm: category.fullForm,
        merchandiseCode: category.merchandiseCode,
        merchandiseDesc: category.merchandiseDesc,
        fabricDivision: category.fabricDivision,
        garmentType: category.garmentType, // NEW: For prompt optimization
        department: {
          code: category.subDepartment.department.code,
          name: category.subDepartment.department.name
        },
        subDepartment: {
          code: category.subDepartment.code,
          name: category.subDepartment.name
        }
      },
      schema,
      stats: {
        totalAttributes: schema.length,
        aiExtractableCount: schema.filter(s => s._metadata.aiExtractable).length,
        requiredCount: schema.filter(s => s._metadata.isRequired).length
      }
    };
  }

  /**
   * 🌳 Get category hierarchy for dropdown
   * Returns full 3-level hierarchy: Departments → SubDepartments → Categories
   */
  async getCategoryHierarchy() {
    const departments = await this.prisma.department.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        subDepartments: {
          orderBy: { displayOrder: 'asc' },
          include: {
            categories: {
              orderBy: { displayOrder: 'asc' }
            }
          }
        }
      }
    });

    return {
      departments: departments.map(dept => ({
        code: dept.code,
        name: dept.name,
        description: dept.description,
        subDepartments: dept.subDepartments.map(subDept => ({
          code: subDept.code,
          name: subDept.name,
          description: subDept.description,
          categories: subDept.categories.map(cat => ({
            code: cat.code,
            name: cat.name,
            fullForm: cat.fullForm,
            fabricDivision: cat.fabricDivision
          }))
        }))
      })),
      stats: {
        totalDepartments: departments.length,
        totalSubDepartments: departments.reduce((sum, d) => sum + d.subDepartments.length, 0),
        totalCategories: departments.reduce((sum, d) => 
          sum + d.subDepartments.reduce((s, sd) => s + sd.categories.length, 0), 0
        )
      }
    };
  }

  /**
   * 🔍 Search categories by name or code
   */
  async searchCategories(query: string, limit: number = 20) {
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { fullForm: { contains: query, mode: 'insensitive' } }
        ]
      },
      include: {
        subDepartment: {
          include: { department: true }
        }
      },
      take: limit,
      orderBy: { displayOrder: 'asc' }
    });

    return categories.map(cat => ({
      code: cat.code,
      name: cat.name,
      fullForm: cat.fullForm,
      department: cat.subDepartment.department.name,
      subDepartment: cat.subDepartment.name,
      fabricDivision: cat.fabricDivision
    }));
  }

  /**
   * 📊 Get category statistics
   */
  async getCategoryStats(categoryCode: string) {
    const category = await this.prisma.category.findUnique({
      where: { code: categoryCode },
      include: {
        attributes: {
          include: {
            attribute: {
              include: {
                allowedValues: { where: { isActive: true } }
              }
            }
          }
        }
      }
    });

    if (!category) {
      throw new Error(`Category with code '${categoryCode}' not found`);
    }

    const attributes = category.attributes.map(ca => ca.attribute);

    return {
      categoryCode: category.code,
      categoryName: category.name,
      totalAttributes: attributes.length,
      enabledAttributes: category.attributes.filter(ca => ca.isEnabled).length,
      requiredAttributes: category.attributes.filter(ca => ca.isRequired).length,
      aiExtractableAttributes: attributes.filter(a => a.aiExtractable).length,
      visibleAttributes: attributes.filter(a => a.visibleFromDistance).length,
      totalAllowedValues: attributes.reduce((sum, a) => sum + a.allowedValues.length, 0),
      attributesByCategory: {
        fabric: attributes.filter(a => a.category === 'fabric').length,
        design: attributes.filter(a => a.category === 'design').length,
        technical: attributes.filter(a => a.category === 'technical').length,
        other: attributes.filter(a => !a.category || a.category === 'other').length
      }
    };
  }

  /**
   * 🧹 Cleanup - disconnect Prisma client
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }
}
