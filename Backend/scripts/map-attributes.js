const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();
const fs = require('fs');

const USER_ATTRIBUTES = [
    'Division', 'Major Category', 'Reference Article Number', 'Reference Article Description',
    'Vendor Name', 'Design Number', 'PPT Number', 'Rate/Price', 'Size', 'Yarn 1', 'Yarn 2',
    'Fabric Main MVGR', 'Weave', 'Composition', 'Finish', 'GSM', 'Shade', 'Lycra/Non Lycra',
    'Neck', 'Neck Details', 'Collar', 'Placket', 'Sleeve', 'Bottom Fold', 'Front Open Style',
    'Pocket Type', 'Fit', 'Pattern', 'Length', 'Drawcord', 'Button', 'Zipper', 'Zip Colour',
    'Print Type', 'Print Style', 'Print Placement', 'Patches', 'Patches Type', 'Embroidery',
    'Embroidery Type', 'Wash', 'Colour', 'Father Belt', 'Child Belt',
];

async function mapAttributes() {
    try {
        console.log('🔍 Mapping attributes to database...\n');

        const masterAttributes = await prisma.masterAttribute.findMany({
            select: { id: true, key: true, label: true, type: true },
        });

        console.log(`📊 Total master attributes in database: ${masterAttributes.length}\n`);

        const mapped = [];

        for (const userAttr of USER_ATTRIBUTES) {
            const normalized = userAttr.toLowerCase().trim();

            const match = masterAttributes.find(attr => {
                const attrLabel = attr.label.toLowerCase().trim();
                const attrKey = attr.key.toLowerCase().trim();

                return attrLabel === normalized ||
                    attrKey === normalized ||
                    attrLabel.replace(/[\/\s-]/g, '') === normalized.replace(/[\/\s-]/g, '') ||
                    attrKey.replace(/[_\s-]/g, '') === normalized.replace(/[\/\s-]/g, '');
            });

            if (match) {
                mapped.push({
                    userLabel: userAttr,
                    dbId: match.id,
                    dbKey: match.key,
                    dbLabel: match.label,
                    dbType: match.type,
                    status: 'FOUND',
                });
                console.log(`✅ ${userAttr.padEnd(35)} → ID: ${match.id.toString().padEnd(4)} Key: ${match.key.padEnd(25)} Type: ${match.type}`);
            } else {
                mapped.push({
                    userLabel: userAttr,
                    dbId: null,
                    dbKey: null,
                    dbLabel: null,
                    dbType: null,
                    status: 'NOT_FOUND',
                });
                console.log(`❌ ${userAttr.padEnd(35)} → NOT FOUND`);
            }
        }

        const foundCount = mapped.filter(m => m.status === 'FOUND').length;
        const notFoundCount = mapped.filter(m => m.status === 'NOT_FOUND').length;

        console.log(`\n📈 Summary:`);
        console.log(`   ✅ Found: ${foundCount}/${USER_ATTRIBUTES.length}`);
        console.log(`   ❌ Not Found: ${notFoundCount}/${USER_ATTRIBUTES.length}`);

        fs.writeFileSync(require('path').join(__dirname, '..', 'outputs', 'attribute-mapping.json'), JSON.stringify(mapped, null, 2));
        console.log(`\n💾 Mapping saved to outputs/attribute-mapping.json`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

mapAttributes();
