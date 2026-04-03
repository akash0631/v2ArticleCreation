import { PrismaClient } from '../src/generated/prisma';
import { mvgrMappingService } from '../src/services/mvgrMappingService';

const prisma = new PrismaClient();

async function main() {
  console.log('Refreshing M_FAB2 from FAB 2 UPDATED.json...');

  await mvgrMappingService.initialize();
  const mFab2Rows = mvgrMappingService.getAllWeave2();

  if (mFab2Rows.length === 0) {
    throw new Error('No M_FAB2 rows were loaded from FAB 2 UPDATED.json');
  }

  await prisma.$transaction(async (tx) => {
    await tx.mvgrLookup.deleteMany({
      where: { type: 'M_FAB2' }
    });

    await tx.mvgrLookup.createMany({
      data: mFab2Rows.map(({ code, fullForm }) => ({
        type: 'M_FAB2',
        code,
        fullForm
      })),
      skipDuplicates: true
    });

    const existingAttribute = await tx.masterAttribute.findFirst({
      where: {
        key: {
          in: ['M_FAB2', 'WEAVE_2']
        }
      }
    });

    if (existingAttribute?.key === 'WEAVE_2') {
      await tx.masterAttribute.update({
        where: { id: existingAttribute.id },
        data: {
          key: 'M_FAB2',
          label: 'M FAB 2',
          type: 'SELECT',
          category: 'FABRIC',
          aiExtractable: true
        }
      });
    } else if (existingAttribute?.key === 'M_FAB2') {
      await tx.masterAttribute.update({
        where: { id: existingAttribute.id },
        data: {
          label: 'M FAB 2',
          type: 'SELECT',
          category: 'FABRIC',
          aiExtractable: true
        }
      });
    } else {
      await tx.masterAttribute.create({
        data: {
          key: 'M_FAB2',
          label: 'M FAB 2',
          displayOrder: 94,
          type: 'SELECT',
          category: 'FABRIC',
          aiExtractable: true,
          isActive: true
        }
      });
    }

    const attribute = await tx.masterAttribute.findFirstOrThrow({
      where: { key: 'M_FAB2' }
    });

    await tx.attributeAllowedValue.deleteMany({
      where: { attributeId: attribute.id }
    });

    await tx.attributeAllowedValue.createMany({
      data: mFab2Rows.map(({ code, fullForm }, index) => ({
        attributeId: attribute.id,
        shortForm: code,
        fullForm,
        displayOrder: index,
        isActive: true
      })),
      skipDuplicates: true
    });
  });

  console.log(`Refreshed M_FAB2 successfully with ${mFab2Rows.length} values.`);
}

main()
  .catch((error) => {
    console.error('Failed to refresh M_FAB2:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
