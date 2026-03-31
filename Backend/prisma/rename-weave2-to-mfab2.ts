import { PrismaClient } from '../src/generated/prisma';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$executeRaw`
    UPDATE mvgr_lookup SET type = 'M_FAB2' WHERE type = 'WEAVE_2'
  `;
  console.log(`✅ Updated ${result} rows in mvgr_lookup: WEAVE_2 → M_FAB2`);

  // Verify
  const count = await prisma.mvgrLookup.count({ where: { type: 'M_FAB2' } });
  console.log(`📊 M_FAB2 rows now in mvgr_lookup: ${count}`);
  await prisma.$disconnect();
}
main().catch(console.error);
