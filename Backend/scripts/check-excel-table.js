const { PrismaClient } = require('../src/generated/prisma');

async function main() {
  const prisma = new PrismaClient();
  try {
    const counts = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS total_values, COUNT(DISTINCT column_name)::int AS total_columns FROM excel_attribute_values'
    );
    console.log(JSON.stringify(counts, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
