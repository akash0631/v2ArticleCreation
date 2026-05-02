require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const p = new PrismaClient();
p.extractionResultFlat.update({
  where: { id: '7fbe6fe5-36d6-42a1-a1da-e43484db387d' },
  data: { macroMvgr: 'TEST_DIRECT' }
}).then(r => {
  console.log('Updated macroMvgr:', r.macroMvgr);
  p.$disconnect();
}).catch(e => { console.error('Error:', e.message); p.$disconnect(); });
