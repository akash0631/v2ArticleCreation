/**
 * Seed WEAVE master attribute allowed values from CAP.json
 * Adds any values missing from the DB — does NOT delete existing ones.
 * Run: npx ts-node --project tsconfig.json prisma/seed-weave-cap.ts
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

type CapRow = {
  Weave: string;
  'Weave full form': string;
};

async function main() {
  // ── 1. Load CAP.json ─────────────────────────────────────────────────────────
  const capPath = path.resolve(__dirname, '../../CAP.json');
  const raw = fs.readFileSync(capPath, 'utf8');
  const capRows: CapRow[] = JSON.parse(`[${raw.trim().replace(/^\[|\]$/g, '')}]`);
  // CAP.json is an array of objects (may lack the outer [] brackets)

  console.log(`📄 CAP.json loaded — ${capRows.length} weave entries\n`);

  // ── 2. Find / create WEAVE master attribute ──────────────────────────────────
  let weaveAttr = await prisma.masterAttribute.findFirst({ where: { key: 'WEAVE' } });

  if (!weaveAttr) {
    weaveAttr = await prisma.masterAttribute.create({
      data: {
        key: 'WEAVE',
        label: 'WEAVE',
        aiExtractable: true,
        type: 'SELECT',
        category: 'FABRIC',
        displayOrder: 16,
        isActive: true,
      },
    });
    console.log(`➕ WEAVE master attribute created (id=${weaveAttr.id})`);
  } else {
    console.log(`ℹ️  WEAVE master attribute found (id=${weaveAttr.id})`);
  }

  const attrId = weaveAttr.id;

  // ── 3. Get existing allowed values (normalised shortForm set) ────────────────
  const existing = await prisma.attributeAllowedValue.findMany({
    where: { attributeId: attrId },
    select: { shortForm: true },
  });

  const existingSet = new Set(existing.map((v) => v.shortForm.trim().toUpperCase()));
  console.log(`📦 Existing values in DB: ${existingSet.size}\n`);

  // ── 4. Determine which entries are missing ───────────────────────────────────
  const toInsert = capRows.filter((row) => {
    const code = (row.Weave || '').trim();
    return code && !existingSet.has(code.toUpperCase());
  });

  if (toInsert.length === 0) {
    console.log('✅ All CAP.json weave values already exist in DB. Nothing to insert.');
    return;
  }

  console.log(`➕ Inserting ${toInsert.length} missing values...\n`);

  // ── 5. Get max current displayOrder ─────────────────────────────────────────
  const maxOrderRow = await prisma.attributeAllowedValue.findFirst({
    where: { attributeId: attrId },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  });
  let nextOrder = (maxOrderRow?.displayOrder ?? -1) + 1;

  // ── 6. Insert missing rows ───────────────────────────────────────────────────
  const insertData = toInsert.map((row) => ({
    attributeId: attrId,
    shortForm: row.Weave.trim(),
    fullForm: (row['Weave full form'] || row.Weave).trim(),
    displayOrder: nextOrder++,
    isActive: true,
  }));

  const result = await prisma.attributeAllowedValue.createMany({
    data: insertData,
    skipDuplicates: true,
  });

  console.log(`✅ Inserted ${result.count} new weave values into WEAVE master attribute.`);

  // ── 7. Print inserted values for verification ────────────────────────────────
  toInsert.forEach((row, i) =>
    console.log(`   ${String(i + 1).padStart(3, ' ')}. ${row.Weave} → ${row['Weave full form']}`)
  );

  const total = await prisma.attributeAllowedValue.count({ where: { attributeId: attrId } });
  console.log(`\n📊 WEAVE total values in DB after seed: ${total}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
