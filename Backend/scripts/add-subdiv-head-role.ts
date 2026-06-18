import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'SUB_DIVISION_HEAD'`
  );
  console.log('SUB_DIVISION_HEAD added to user_role enum successfully');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
