import { Request, Response } from 'express';
import { prismaClient as prisma } from '../utils/prisma';

// Maps masterAttribute.key (schema key) → extractionResultFlat column name (dbField)
// This is the backend counterpart of SCHEMA_KEY_TO_DB_FIELD in the frontend.
const SCHEMA_KEY_TO_DB_FIELD: Record<string, string> = {
  macro_mvgr: 'macroMvgr', main_mvgr: 'mainMvgr', yarn_01: 'yarn1',
  fabric_main_mvgr: 'fabricMainMvgr', weave: 'weave', m_fab2: 'mFab2',
  composition: 'composition', finish: 'finish', gsm: 'gsm',
  lycra_non_lycra: 'lycra', collar: 'collar', collar_style: 'collarStyle',
  placket: 'placket', sleeve: 'sleeve', sleeve_fold: 'sleeveFold',
  bottom_fold: 'bottomFold', neck: 'neck', neck_details: 'neckDetails',
  neck_detail: 'neckDetails', fit: 'fit', length: 'length',
  body_style: 'bodyStyle', pocket_type: 'pocketType', no_of_pocket: 'noOfPocket',
  print_type: 'printType', print_style: 'printStyle', print_placement: 'printPlacement',
  patches: 'patches', patch_type: 'patchesType', patches_type: 'patches',
  embroidery: 'embroidery', embroidery_type: 'embroideryType',
  emb_placement: 'embPlacement', button: 'button', btn_colour: 'btnColour',
  zipper: 'zipper', zip_colour: 'zipColour', wash: 'wash',
  drawcord: 'drawcord', dc_shape: 'dcShape', father_belt: 'fatherBelt',
  htrf_type: 'htrfType', htrf_style: 'htrfStyle', shade: 'shade',
  weight: 'weight', child_belt: 'childBelt', front_open_style: 'frontOpenStyle',
  segment: 'segment', age_group: 'ageGroup', article_fashion_type: 'articleFashionType',
  mvgr_brand_vendor: 'mvgrBrandVendor', f_count: 'fCount',
  f_construction: 'fConstruction', f_ounce: 'fOunce', f_width: 'fWidth',
  extra_pocket: 'extraPocket', imp_atrbt2: 'impAtrbt2',
};

/** GET /api/article-config/fields — all active field configs */
export async function getFieldConfigs(req: Request, res: Response) {
  try {
    const attrs = await prisma.masterAttribute.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, group: true, label: true, key: true, displayOrder: true },
    });
    const data = attrs.map(a => ({
      id: a.id,
      section: a.group || 'GENERAL',
      uiLabel: a.label || a.key,
      dbField: SCHEMA_KEY_TO_DB_FIELD[a.key] ?? a.key,
      sapField: SCHEMA_KEY_TO_DB_FIELD[a.key] ?? a.key,
      displayOrder: a.displayOrder,
    }));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch field configs' });
  }
}

/**
 * GET /api/article-config/values?division=MENS
 *    or ?majorCategory=MENS   (alias, same behaviour)
 *
 * Returns: { dbField: string[] } — allowed values per field (not division-scoped,
 * since masterAttribute/attributeAllowedValue are not division-scoped in this schema).
 */
export async function getAttributeValues(req: Request, res: Response) {
  const scope = (
    (req.query.division as string) ||
    (req.query.majorCategory as string)
  )?.trim().toUpperCase();

  if (!scope) {
    res.status(400).json({ success: false, message: 'division is required (MENS | LADIES | KIDS)' });
    return;
  }

  try {
    const attrs = await prisma.masterAttribute.findMany({
      where: { isActive: true },
      select: {
        key: true,
        allowedValues: {
          where: { isActive: true },
          select: { shortForm: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    const grouped: Record<string, string[]> = {};
    for (const attr of attrs) {
      if (attr.allowedValues.length === 0) continue;
      const dbField = SCHEMA_KEY_TO_DB_FIELD[attr.key] ?? attr.key;
      grouped[dbField] = attr.allowedValues.map(av => av.shortForm);
    }

    res.json({ success: true, division: scope, data: grouped });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch attribute values' });
  }
}

/**
 * GET /api/article-config/category-attributes/:code
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
