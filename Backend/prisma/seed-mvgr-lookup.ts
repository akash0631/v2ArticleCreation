/**
 * Seed the mvgr_lookup table with data from Book10.json, Book11.json, Book13.json
 * Run: npx ts-node prisma/seed-mvgr-lookup.ts
 */
import { PrismaClient } from '../src/generated/prisma';
import { mvgrMappingService } from '../src/services/mvgrMappingService';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding mvgr_lookup table...\n');

  // Load all mappings from JSON files
  await mvgrMappingService.initialize();
  const stats = mvgrMappingService.getStats();
  console.log(`📂 Loaded from JSON files:
   - Macro MVGR (Book10.json): ${stats.macroMvgrCount} entries
   - Main MVGR  (Book11.json): ${stats.mainMvgrCount} entries
   - Weave2     (Book13.json): ${stats.weave2Count} entries\n`);

  // Wipe existing rows and re-seed fresh
  await prisma.mvgrLookup.deleteMany({});
  console.log('🗑️  Cleared existing mvgr_lookup rows');

  // --- Macro MVGR (Book10.json → OTHER MVGR - 01) ---
  const macroRows = mvgrMappingService.getAllMacroMvgr().map(({ code, fullForm }) => ({
    type: 'MACRO_MVGR',
    code,
    fullForm,
  }));

  await prisma.mvgrLookup.createMany({ data: macroRows, skipDuplicates: true });
  console.log(`✅ Inserted ${macroRows.length} Macro MVGR rows`);

  // --- Main MVGR (Book11.json → OTHER MVGR - 02) ---
  const mainRows = mvgrMappingService.getAllMainMvgr().map(({ code, fullForm }) => ({
    type: 'MAIN_MVGR',
    code,
    fullForm,
  }));

  await prisma.mvgrLookup.createMany({ data: mainRows, skipDuplicates: true });
  console.log(`✅ Inserted ${mainRows.length} Main MVGR rows`);

  // --- M_FAB2 (Book13.json → M_FAB2) ---
  const weave2Rows = mvgrMappingService.getAllWeave2().map(({ code, fullForm }) => ({
    type: 'M_FAB2',
    code,
    fullForm,
  }));

  await prisma.mvgrLookup.createMany({ data: weave2Rows, skipDuplicates: true });
  console.log(`✅ Inserted ${weave2Rows.length} Weave2 rows`);

  // Final count
  const total = await prisma.mvgrLookup.count();
  console.log(`\n📊 Total rows in mvgr_lookup: ${total}`);
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
