require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const p = new PrismaClient();

async function main() {
  const records = await p.extractionResultFlat.findMany({
    where: { pptNumber: 'PRES-00003', isGeneric: true },
    select: { id: true, pptNumber: true, designNumber: true, macroMvgr: true, createdAt: true, source: true }
  });
  console.log(`Found ${records.length} PRES-00003 generic records:`);
  console.log(JSON.stringify(records, null, 2));
}
main().finally(() => p.$disconnect());
