import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

/** GET /api/article-config/fields — all active field configs */
export async function getFieldConfigs(req: Request, res: Response) {
  try {
    const fields = await prisma.sapFieldConfig.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, section: true, uiLabel: true, dbField: true, sapField: true, displayOrder: true },
    });
    res.json({ success: true, data: fields });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch field configs' });
  }
}

/**
 * GET /api/article-config/values?division=MENS
 *    or ?majorCategory=MENS   (alias, same behaviour)
 *
 * Returns: { dbField: string[] } — allowed values scoped to the given division.
 * Divisions: MENS | LADIES | KIDS
 */
export async function getAttributeValues(req: Request, res: Response) {
  // Accept both `division` and `majorCategory` as the scope key
  const scope = (
    (req.query.division as string) ||
    (req.query.majorCategory as string)
  )?.trim().toUpperCase();

  if (!scope) {
    res.status(400).json({ success: false, message: 'division is required (MENS | LADIES | KIDS)' });
    return;
  }

  try {
    const rows = await prisma.sapAttributeValue.findMany({
      where: { majorCategory: scope, isActive: true },
      orderBy: [{ fieldConfigId: 'asc' }, { displayOrder: 'asc' }],
      select: { value: true, fieldConfig: { select: { dbField: true } } },
    });

    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      const key = row.fieldConfig.dbField;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row.value);
    }

    res.json({ success: true, division: scope, data: grouped });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch attribute values' });
  }
}

/**
 * GET /api/article-config/category-attributes/:code
 *
 * Returns the enabled/required attribute keys for a given major category code.
 * Used by article cards to decide which fields to show.
 *
 * Response: { configured: boolean, enabled: string[], required: string[] }
 * - configured: false means no mappings exist yet → caller should show all fields (fallback)
 * - enabled: array of schemaKey strings that are enabled for this category
 * - required: subset of enabled that are also required
 */
export async function getCategoryAttributeConfig(req: Request, res: Response) {
  const { code } = req.params;
  if (!code) {
    res.status(400).json({ success: false, message: 'category code is required' });
    return;
  }

  try {
    const category = await prisma.category.findUnique({
      where: { code: code.trim() },
      include: {
        attributes: {
          include: {
            attribute: { select: { key: true } },
          },
        },
      },
    });

    if (!category) {
      res.json({ success: true, configured: false, enabled: [], required: [] });
      return;
    }

    const hasAnyEnabled = category.attributes.some(a => a.isEnabled);

    if (!hasAnyEnabled) {
      // No attributes enabled yet — tell frontend to use fallback
      res.json({ success: true, configured: false, enabled: [], required: [] });
      return;
    }

    const enabled: string[] = [];
    const required: string[] = [];

    for (const mapping of category.attributes) {
      if (mapping.isEnabled) {
        enabled.push(mapping.attribute.key);
        if (mapping.isRequired) required.push(mapping.attribute.key);
      }
    }

    res.json({ success: true, configured: true, enabled, required });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch category attribute config' });
  }
}
