require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const p = new PrismaClient();

async function main() {
  // Reset the test record
  await p.extractionResultFlat.update({
    where: { id: '7fbe6fe5-36d6-42a1-a1da-e43484db387d' },
    data: { macroMvgr: null }
  });
  console.log('Reset macroMvgr to null');

  // Show all users
  const users = await p.user.findMany({ select: { id: true, email: true, role: true, isActive: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
}
main().finally(() => p.$disconnect());
