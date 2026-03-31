import { PrismaClient } from '../src/generated/prisma';
const prisma = new PrismaClient();
async function main() {
  const cols = await prisma.$queryRaw<any[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'extraction_results_flat'
    AND column_name IN ('m_fab2','m_fab2_full_form','weave_2','weave_2_full_form')
    ORDER BY column_name
  `;
  console.log('Columns found:', cols.map((c: any) => c.column_name));
  await prisma.$disconnect();
}
main().catch(console.error);
