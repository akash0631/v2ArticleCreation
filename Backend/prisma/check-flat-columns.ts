import { PrismaClient } from '../src/generated/prisma';
const prisma = new PrismaClient();
async function main() {
  const cols = await prisma.$queryRaw<any[]>`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'extraction_results_flat'
    AND column_name IN (
      'macro_mvgr','macro_mvgr_full_form',
      'main_mvgr','main_mvgr_full_form',
      'weave_2','weave_2_full_form','weave_full_form'
    )
    ORDER BY column_name
  `;
  console.log('\nNew columns in extraction_results_flat:');
  if (cols.length === 0) {
    console.log('❌ NONE of the new columns exist!');
  } else {
    cols.forEach((c: any) => console.log(`  ✅ ${c.column_name} (${c.data_type})`));
    const expected = ['macro_mvgr','macro_mvgr_full_form','main_mvgr','main_mvgr_full_form','weave_2','weave_2_full_form','weave_full_form'];
    const found = cols.map((c: any) => c.column_name);
    const missing = expected.filter(e => !found.includes(e));
    if (missing.length > 0) console.log('\n❌ Missing:', missing);
    else console.log('\n✅ All 7 columns present!');
  }
  await prisma.$disconnect();
}
main().catch(console.error);
