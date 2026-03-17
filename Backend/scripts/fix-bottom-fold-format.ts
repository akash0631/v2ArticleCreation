import { prismaClient as prisma } from '../src/utils/prisma';

const TARGET_VALUE = 'SLF_FOLD';
const LEGACY_VALUES = ['SLF FOLD', 'SLF  FOLD', 'SLF-FOLD'];

async function main(): Promise<void> {
  const attribute = await prisma.masterAttribute.findFirst({
    where: {
      OR: [
        { key: { equals: 'BOTTOM_FOLD', mode: 'insensitive' } },
        { key: { equals: 'bottom_fold', mode: 'insensitive' } },
        { label: { equals: 'BOTTOM FOLD', mode: 'insensitive' } }
      ]
    },
    select: { id: true, key: true, label: true }
  });

  if (!attribute) {
    throw new Error('BOTTOM_FOLD attribute not found.');
  }

  // Ensure canonical value exists
  let target = await prisma.attributeAllowedValue.findFirst({
    where: { attributeId: attribute.id, shortForm: TARGET_VALUE },
    select: { id: true }
  });

  if (!target) {
    target = await prisma.attributeAllowedValue.create({
      data: {
        attributeId: attribute.id,
        shortForm: TARGET_VALUE,
        fullForm: TARGET_VALUE,
        isActive: true
      },
      select: { id: true }
    });
  }

  const legacyRows = await prisma.attributeAllowedValue.findMany({
    where: {
      attributeId: attribute.id,
      shortForm: { in: LEGACY_VALUES }
    },
    select: { id: true, shortForm: true }
  });

  const legacyIds = legacyRows.map((x) => x.id).filter((id) => id !== target!.id);

  if (legacyIds.length > 0) {
    await prisma.extractionResult.updateMany({
      where: { matchedValueId: { in: legacyIds } },
      data: { matchedValueId: target.id }
    });

    await prisma.attributeAllowedValue.updateMany({
      where: { id: { in: legacyIds } },
      data: { isActive: false }
    });
  }

  // Normalize values in extraction tables
  const updatedResultsRaw = await prisma.$executeRawUnsafe(
    `
    UPDATE extraction_results
       SET raw_value = $1
     WHERE attribute_id = $2
       AND raw_value IN (${LEGACY_VALUES.map((_, i) => `$${i + 3}`).join(',')});
    `,
    TARGET_VALUE,
    attribute.id,
    ...LEGACY_VALUES
  );

  const updatedResultsFinal = await prisma.$executeRawUnsafe(
    `
    UPDATE extraction_results
       SET final_value = $1
     WHERE attribute_id = $2
       AND final_value IN (${LEGACY_VALUES.map((_, i) => `$${i + 3}`).join(',')});
    `,
    TARGET_VALUE,
    attribute.id,
    ...LEGACY_VALUES
  );

  const updatedFlat = await prisma.$executeRawUnsafe(
    `
    UPDATE extraction_results_flat
       SET bottom_fold = $1
     WHERE bottom_fold IN (${LEGACY_VALUES.map((_, i) => `$${i + 2}`).join(',')});
    `,
    TARGET_VALUE,
    ...LEGACY_VALUES
  );

  console.log('✅ Bottom fold format normalized');
  console.log(`   Attribute: ${attribute.key} (${attribute.id})`);
  console.log(`   Canonical value: ${TARGET_VALUE}`);
  console.log(`   Legacy rows deactivated: ${legacyIds.length}`);
  console.log(`   extraction_results.raw_value updated: ${Number(updatedResultsRaw || 0)}`);
  console.log(`   extraction_results.final_value updated: ${Number(updatedResultsFinal || 0)}`);
  console.log(`   extraction_results_flat.bottom_fold updated: ${Number(updatedFlat || 0)}`);
}

main()
  .catch((error) => {
    console.error('❌ Fix failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
