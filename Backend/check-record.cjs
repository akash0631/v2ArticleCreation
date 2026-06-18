require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const p = new PrismaClient();
p.extractionResultFlat.findUnique({
  where: { id: '7fbe6fe5-36d6-42a1-a1da-e43484db387d' },
  select: { id: true, macroMvgr: true, weave: true, fabricMainMvgr: true, impAtrbt2: true, mainMvgr: true, mFab2: true, source: true, pptNumber: true }
}).then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error).finally(() => p.$disconnect());
