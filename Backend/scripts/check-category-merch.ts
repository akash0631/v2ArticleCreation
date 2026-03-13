import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const samples = ['L_KURTI_ST', 'L_KURTI_FS', 'MW_TEES_FS', 'M_TEES_FS', 'M_BRIEF', 'L_PLAZO'];

  for (const code of samples) {
    const category = await prisma.category.findUnique({
      where: { code },
      select: {
        code: true,
        name: true,
        fullForm: true,
        merchandiseCode: true,
        merchandiseDesc: true
      }
    });
    console.log(code, '=>', category);
  }

  const withMerch = await prisma.category.count({ where: { merchandiseCode: { not: null } } });
  const total = await prisma.category.count();
  console.log(`Categories with merchandiseCode: ${withMerch}/${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
