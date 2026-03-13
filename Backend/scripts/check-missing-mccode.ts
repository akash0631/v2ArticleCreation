import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.extractionResultFlat.count();
  const nullCount = await prisma.extractionResultFlat.count({ where: { mcCode: null } });
  const nonNullCount = await prisma.extractionResultFlat.count({ where: { mcCode: { not: null } } });

  console.log(`Total rows: ${total}`);
  console.log(`Rows with null mcCode: ${nullCount}`);
  console.log(`Rows with non-null mcCode: ${nonNullCount}`);

  const rows = await prisma.extractionResultFlat.findMany({
    where: { mcCode: null },
    select: { majorCategory: true },
    take: 5000
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = (r.majorCategory || 'NULL').trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  console.log(`Rows with null mcCode (sampled): ${rows.length}`);
  console.log('Top majorCategory values:');
  for (const [k, v] of top) {
    console.log(`${v}\t${k}`);
  }

  const presentRows = await prisma.extractionResultFlat.findMany({
    where: { mcCode: { not: null } },
    select: { majorCategory: true, mcCode: true },
    take: 100
  });

  if (presentRows.length > 0) {
    console.log('Sample rows with mcCode already present:');
    for (const row of presentRows.slice(0, 20)) {
      console.log(`${row.majorCategory || 'NULL'} => ${row.mcCode}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
