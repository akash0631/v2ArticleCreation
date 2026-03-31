/**
 * Seed MACRO_MVGR, MAIN_MVGR, M_FAB2 as master attributes with allowed values
 * read directly from the mvgr_lookup table.
 * Run: npx ts-node --project tsconfig.json prisma/seed-mvgr-master-attributes.ts
 */
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function upsertAttribute(
  key: string,
  label: string,
  displayOrder: number,
  values: Array<{ code: string; fullForm: string }>
) {
  const data = {
    label,
    aiExtractable: true,
    type: 'SELECT' as const,
    category: 'FABRIC',
  };

  const existing = await prisma.masterAttribute.findFirst({ where: { key } });

  if (existing) {
    // Wipe old allowed values and re-insert from mvgr_lookup
    await prisma.attributeAllowedValue.deleteMany({ where: { attributeId: existing.id } });
    await prisma.masterAttribute.update({ where: { key }, data });
    console.log(`ℹ️  ${key} already exists (id=${existing.id}), refreshing allowed values...`);
  } else {
    await prisma.masterAttribute.create({ data: { key, displayOrder, ...data } });
    console.log(`➕ ${key} created`);
  }

  const attr = await prisma.masterAttribute.findFirstOrThrow({ where: { key } });

  await prisma.attributeAllowedValue.createMany({
    data: values.map((v, i) => ({
      attributeId: attr.id,
      shortForm: v.code,
      fullForm: v.fullForm,
      displayOrder: i,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  console.log(`✅ ${key} (id=${attr.id}) → ${values.length} allowed values inserted`);
}

async function main() {
  console.log('🌱 Seeding master attributes from mvgr_lookup table...\n');

  // ─── Fetch all rows from mvgr_lookup grouped by type ───────────────────────
  const allRows = await prisma.mvgrLookup.findMany({ orderBy: { id: 'asc' } });

  const macroRows = allRows.filter((r) => r.type === 'MACRO_MVGR').map((r) => ({ code: r.code, fullForm: r.fullForm }));
  const mainRows  = allRows.filter((r) => r.type === 'MAIN_MVGR').map((r) => ({ code: r.code, fullForm: r.fullForm }));
  const mFab2Rows = allRows.filter((r) => r.type === 'M_FAB2').map((r) => ({ code: r.code, fullForm: r.fullForm }));

  console.log(`📦 Found in mvgr_lookup → MACRO_MVGR: ${macroRows.length}, MAIN_MVGR: ${mainRows.length}, M_FAB2: ${mFab2Rows.length}\n`);

  // ─── 1. MACRO_MVGR ─────────────────────────────────────────────────────────
  await upsertAttribute('MACRO_MVGR', 'MACRO MVGR', 95, macroRows);

  // ─── 2. MAIN_MVGR ──────────────────────────────────────────────────────────
  await upsertAttribute('MAIN_MVGR', 'MAIN MVGR', 96, mainRows);

  // ─── 3. M_FAB2 (was WEAVE_2, update key + label + values) ─────────────────
  // Rename key from WEAVE_2 → M_FAB2 if still old name
  const oldWeave2 = await prisma.masterAttribute.findFirst({ where: { key: 'WEAVE_2' } });
  if (oldWeave2) {
    await prisma.masterAttribute.update({ where: { key: 'WEAVE_2' }, data: { key: 'M_FAB2', label: 'M FAB 2' } });
    console.log(`🔄 Renamed master attribute WEAVE_2 → M_FAB2`);
  }
  await upsertAttribute('M_FAB2', 'M FAB 2', 94, mFab2Rows);

  // ─── Summary ───────────────────────────────────────────────────────────────
  const total = await prisma.masterAttribute.count({ where: { key: { in: ['MACRO_MVGR', 'MAIN_MVGR', 'M_FAB2'] } } });
  console.log(`\n🎉 Done! ${total}/3 master attributes ready in DB.`);
}

main()
  .catch((e) => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

