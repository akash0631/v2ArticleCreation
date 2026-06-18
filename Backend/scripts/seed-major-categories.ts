/**
 * seed-major-categories.ts
 *
 * Seeds all major categories from mc-code-list-major-category.json
 * into the DB categories table (Department → SubDepartment → Category).
 *
 * Run: npx ts-node scripts/seed-major-categories.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── Load source JSON ─────────────────────────────────────────────────────────
const MC_JSON_PATH = path.join(
  __dirname,
  '../../Frontend/src/data/mc-code-list-major-category.json',
);
const MC_MAP_PATH = path.join(
  __dirname,
  '../../Frontend/src/data/majorCategoryMap.ts',
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mcRows: Array<{
  'mc des'?: string;
  'mc code'?: string | number;
  division?: string;
  'sub division'?: string;
}> = require(MC_JSON_PATH);

// ─── Division → Department code in DB ────────────────────────────────────────
// JSON division "MENS" matches DB dept code "MEN" (sub-depts MU, MW, ML etc.)
// JSON division "LADIES" matches DB dept code "LADIES"
// JSON division "KIDS"   matches DB dept code "KIDS"
const DIVISION_TO_DEPT_CODE: Record<string, string> = {
  MENS:   'MEN',
  LADIES: 'LADIES',
  KIDS:   'KIDS',
};

// ─── Garment type heuristic ───────────────────────────────────────────────────
function guessGarmentType(code: string): 'UPPER' | 'LOWER' | 'ALL_IN_ONE' {
  const u = code.toUpperCase();
  const lowerKw = ['PANT', 'JEANS', 'SHORT', 'BERMUDA', 'BERMDA', 'TROUSER',
    'LEGGING', 'LEGGN', 'SKIRT', 'JOGGER', 'CARGO', 'TRACKPANT', 'LOWER'];
  const setKw   = ['SUIT', '_SET', 'SETS_', 'COORD', 'JUMPSUIT', 'ROMPER',
    'DNGR', 'DUNGAREE', 'OVERALL', 'B_SUIT', 'H_B_SUIT', 'T_B_SUIT', 'H_DNGR'];

  if (setKw.some(k => u.includes(k)))   return 'ALL_IN_ONE';
  if (lowerKw.some(k => u.includes(k))) return 'LOWER';
  return 'UPPER';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`📖 Loaded ${mcRows.length} rows from JSON\n`);

  // 1. Cache all departments and sub-departments from DB
  const departments = await prisma.department.findMany({
    include: { subDepartments: true },
  });

  const deptByCode = new Map(departments.map(d => [d.code, d]));
  const subDeptMap = new Map<string, number>(); // "DEPT_CODE|SUB_CODE" → subDeptId

  for (const dept of departments) {
    for (const sub of dept.subDepartments) {
      subDeptMap.set(`${dept.code}|${sub.code}`, sub.id);
    }
  }

  // 2. Process rows
  let created = 0;
  let skipped = 0;
  let noSubDept = 0;

  const FALLBACK_SUB: Record<string, string> = {
    MEN:    'MU',
    LADIES: 'LU',
    KIDS:   'KB',
  };

  for (const row of mcRows) {
    const mcDes  = (row['mc des'] || '').trim();
    const mcCode = row['mc code'] ? String(row['mc code']).trim() : null;
    const div    = (row.division || '').trim().toUpperCase();
    const subDiv = (row['sub division'] || '').trim();

    if (!mcDes || !div) { skipped++; continue; }

    const deptCode = DIVISION_TO_DEPT_CODE[div];
    if (!deptCode) { console.warn(`  ⚠ Unknown division "${div}" for ${mcDes}`); skipped++; continue; }

    // Resolve sub-department
    let subDeptId = subDeptMap.get(`${deptCode}|${subDiv}`);
    if (!subDeptId) {
      // Try fallback sub-dept for rows with empty or unknown sub division
      const fallbackCode = FALLBACK_SUB[deptCode];
      subDeptId = subDeptMap.get(`${deptCode}|${fallbackCode}`);
      if (subDeptId) {
        noSubDept++;
      } else {
        console.warn(`  ⚠ Sub-dept "${subDiv}" not found for dept ${deptCode} — skipping ${mcDes}`);
        skipped++;
        continue;
      }
    }

    const garmentType = guessGarmentType(mcDes);

    await prisma.category.upsert({
      where: { code: mcDes },
      create: {
        subDepartmentId: subDeptId,
        code:            mcDes,
        name:            mcDes,
        merchandiseCode: mcCode || null,
        garmentType,
        isActive:        true,
        displayOrder:    0,
      },
      update: {
        merchandiseCode: mcCode || null,
        garmentType,
        isActive: true,
      },
    });

    created++;
    if (created % 50 === 0) process.stdout.write(`  ... ${created} upserted\n`);
  }

  console.log(`\n✅ Done.`);
  console.log(`   Upserted  : ${created}`);
  console.log(`   Fallback sub-dept used : ${noSubDept}`);
  console.log(`   Skipped   : ${skipped}`);
}

main()
  .catch(err => { console.error('❌ Error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
