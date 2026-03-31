import { PrismaClient } from '../src/generated/prisma';
const prisma = new PrismaClient();
async function main() {
  const attrs = await prisma.masterAttribute.findMany({
    where: { key: { in: ['MACRO_MVGR', 'MAIN_MVGR', 'WEAVE_2', 'FABRIC_MAIN_MVGR'] } },
    select: { id: true, key: true, label: true, aiExtractable: true, _count: { select: { categoryAttributes: true } } }
  });
  console.log(JSON.stringify(attrs, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
