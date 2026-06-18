import { prismaClient as prisma } from '../src/utils/prisma';

async function main() {
  try {
    console.log('Fetching master attributes from database...');
    const attrs = await prisma.masterAttribute.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { allowedValues: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } }
    });

    console.log(`Found ${attrs.length} master attributes:\n`);

    attrs.forEach((a, i) => {
      console.log(`${i + 1}. ${a.key} — ${a.label} (type: ${a.type}) [id: ${a.id}]`);
      if (a.allowedValues && a.allowedValues.length > 0) {
        const vals = a.allowedValues.map(v => `${v.shortForm || v.fullForm}`).slice(0, 10);
        console.log(`   Allowed values (${a.allowedValues.length}): ${vals.join(', ')}${a.allowedValues.length > 10 ? ', ...' : ''}`);
      }
    });

    // Print a JSON summary file to disk for easy copy/paste
    const fs = await import('fs');
    const out = attrs.map(a => ({ id: a.id, key: a.key, label: a.label, type: a.type, allowedValues: a.allowedValues.map(v => ({ shortForm: v.shortForm, fullForm: v.fullForm })) }));
    const outPath = require('path').join(__dirname, '..', 'outputs', 'master-attributes.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log('\nWrote master-attributes.json to outputs/ folder.');
  } catch (err: any) {
    console.error('Error fetching master attributes:', err.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
