import { prismaClient as prisma } from '../src/utils/prisma';

type AllowedValueRow = {
  id: number;
  attributeId: number;
  shortForm: string;
  fullForm: string;
  isActive: boolean;
};

type MasterAttrRow = {
  id: number;
  key: string;
};

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s_\-]+/g, '')
    .trim();
}

function scoreCanonical(value: string, excelPreferred: Set<string>): number {
  let score = 0;
  if (excelPreferred.has(value)) score += 100;
  if (value.includes('_')) score += 20;
  if (!value.includes(' ')) score += 10;
  if (/^[A-Z0-9_\- ]+$/.test(value)) score += 2;
  return score;
}

async function main(): Promise<void> {
  console.log('🔄 Normalizing attribute value formats across all mapped attributes...');

  const attrs = await prisma.masterAttribute.findMany({
    select: { id: true, key: true }
  });

  const attrKeyById = new Map<number, string>(attrs.map((a: MasterAttrRow) => [a.id, a.key]));

  // Preferred strings from Excel source (if available) for mapped columns
  const excelPreferredByAttr = new Map<number, Set<string>>();
  try {
    const excelRows = await prisma.$queryRawUnsafe<Array<{ attribute_id: number; raw_value: string }>>(`
      SELECT m.attribute_id, e.raw_value
      FROM excel_attribute_values e
      JOIN excel_column_attribute_mapping m ON m.column_name = e.column_name
      WHERE m.attribute_id IS NOT NULL
    `);

    for (const row of excelRows) {
      const set = excelPreferredByAttr.get(row.attribute_id) || new Set<string>();
      set.add(String(row.raw_value || '').trim());
      excelPreferredByAttr.set(row.attribute_id, set);
    }
  } catch {
    // excel mapping tables may not exist in some environments
  }

  const allAllowed = await prisma.attributeAllowedValue.findMany({
    select: {
      id: true,
      attributeId: true,
      shortForm: true,
      fullForm: true,
      isActive: true
    }
  });

  const byAttr = new Map<number, AllowedValueRow[]>();
  for (const row of allAllowed as AllowedValueRow[]) {
    const list = byAttr.get(row.attributeId) || [];
    list.push(row);
    byAttr.set(row.attributeId, list);
  }

  const flatCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'extraction_results_flat'
  `);
  const flatColSet = new Set(flatCols.map((x) => x.column_name));

  let duplicateGroups = 0;
  let deactivated = 0;
  let resultRowsUpdated = 0;
  let flatRowsUpdated = 0;

  for (const [attributeId, values] of byAttr.entries()) {
    const groups = new Map<string, AllowedValueRow[]>();

    for (const v of values) {
      const norm = normalizeToken(v.shortForm);
      if (!norm) continue;
      const list = groups.get(norm) || [];
      list.push(v);
      groups.set(norm, list);
    }

    const attrKey = attrKeyById.get(attributeId) || '';
    const flatColumn = attrKey.toLowerCase();
    const hasSafeColumnName = /^[a-z0-9_]+$/.test(flatColumn);
    const hasFlatColumn = hasSafeColumnName && flatColSet.has(flatColumn);

    for (const groupRows of groups.values()) {
      if (groupRows.length <= 1) continue;
      duplicateGroups += 1;

      const excelPreferred = excelPreferredByAttr.get(attributeId) || new Set<string>();
      const canonical = [...groupRows].sort((a, b) => {
        const sa = scoreCanonical(a.shortForm, excelPreferred);
        const sb = scoreCanonical(b.shortForm, excelPreferred);
        if (sa !== sb) return sb - sa;
        // keep active value first
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.id - b.id;
      })[0];

      // Ensure canonical is active
      if (!canonical.isActive) {
        await prisma.attributeAllowedValue.update({
          where: { id: canonical.id },
          data: { isActive: true }
        });
      }

      for (const row of groupRows) {
        if (row.id === canonical.id) continue;

        const oldShort = row.shortForm;
        const oldFull = row.fullForm;

        const upd1 = await prisma.extractionResult.updateMany({
          where: { matchedValueId: row.id },
          data: { matchedValueId: canonical.id }
        });

        const upd2 = await prisma.extractionResult.updateMany({
          where: { attributeId, rawValue: oldShort },
          data: { rawValue: canonical.shortForm }
        });

        const upd3 = await prisma.extractionResult.updateMany({
          where: { attributeId, finalValue: oldShort },
          data: { finalValue: canonical.shortForm }
        });

        let upd4Count = 0;
        let upd5Count = 0;

        if (oldFull && oldFull !== oldShort) {
          const upd4 = await prisma.extractionResult.updateMany({
            where: { attributeId, rawValue: oldFull },
            data: { rawValue: canonical.shortForm }
          });
          const upd5 = await prisma.extractionResult.updateMany({
            where: { attributeId, finalValue: oldFull },
            data: { finalValue: canonical.shortForm }
          });
          upd4Count = upd4.count;
          upd5Count = upd5.count;
        }

        resultRowsUpdated += upd1.count + upd2.count + upd3.count + upd4Count + upd5Count;

        if (hasFlatColumn) {
          const updFlat1 = await prisma.$executeRawUnsafe(
            `UPDATE extraction_results_flat SET ${flatColumn} = $1 WHERE ${flatColumn} = $2`,
            canonical.shortForm,
            oldShort
          );
          flatRowsUpdated += Number(updFlat1 || 0);

          if (oldFull && oldFull !== oldShort) {
            const updFlat2 = await prisma.$executeRawUnsafe(
              `UPDATE extraction_results_flat SET ${flatColumn} = $1 WHERE ${flatColumn} = $2`,
              canonical.shortForm,
              oldFull
            );
            flatRowsUpdated += Number(updFlat2 || 0);
          }
        }

        await prisma.attributeAllowedValue.update({
          where: { id: row.id },
          data: { isActive: false }
        });
        deactivated += 1;
      }
    }
  }

  console.log('✅ Normalization complete');
  console.log(`   Duplicate groups normalized: ${duplicateGroups}`);
  console.log(`   Duplicate allowed values deactivated: ${deactivated}`);
  console.log(`   extraction_results rows updated: ${resultRowsUpdated}`);
  console.log(`   extraction_results_flat rows updated: ${flatRowsUpdated}`);
}

main()
  .catch((error) => {
    console.error('❌ Normalization failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
