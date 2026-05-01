const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();
const fs = require('fs');

// User-provided corrections
const USER_CORRECTIONS = {
    'Yarn 1': 'YARN_01',
    'Yarn 2': 'YARN_02',
    'GSM': 'GRAM_PER_SQUARE_METER',
    'Neck Details': 'NECK_DETAIL',
    'Patches Type': 'PATCH_TYPE',
    'Colour': 'COLOR',
    'Child Belt': 'CHILD_BELT_DETAIL'
};

async function updateMapping() {
    try {
        console.log('🔍 Updating attribute mapping with user corrections...\n');

        const masterAttributes = await prisma.masterAttribute.findMany({
            select: { id: true, key: true, label: true, type: true },
        });

        console.log(`📊 Total master attributes in database: ${masterAttributes.length}\n`);

        // Read existing mapping
        const mappingPath = require('path').join(__dirname, '..', 'outputs', 'attribute-mapping.json');
        const existingMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

        let updatedCount = 0;

        // Update with user corrections
        for (const item of existingMapping) {
            if (item.status === 'NOT_FOUND' && USER_CORRECTIONS[item.userLabel]) {
                const correctKey = USER_CORRECTIONS[item.userLabel];
                const match = masterAttributes.find(attr => attr.key === correctKey);

                if (match) {
                    item.dbId = match.id;
                    item.dbKey = match.key;
                    item.dbLabel = match.label;
                    item.dbType = match.type;
                    item.status = 'FOUND';
                    updatedCount++;
                    console.log(`✅ UPDATED: ${item.userLabel.padEnd(25)} → ID: ${match.id.toString().padEnd(4)} Key: ${match.key.padEnd(30)} Type: ${match.type}`);
                } else {
                    console.log(`❌ NOT FOUND: ${item.userLabel.padEnd(25)} → Key: ${correctKey} (not in database)`);
                }
            }
        }

        const foundCount = existingMapping.filter(m => m.status === 'FOUND').length;
        const notFoundCount = existingMapping.filter(m => m.status === 'NOT_FOUND').length;

        console.log(`\n📈 Updated Summary:`);
        console.log(`   ✅ Found: ${foundCount}/44`);
        console.log(`   ❌ Not Found: ${notFoundCount}/44`);
        console.log(`   🔄 Updated: ${updatedCount}`);

        // Save updated mapping
        fs.writeFileSync(mappingPath, JSON.stringify(existingMapping, null, 2));
        console.log(`\n💾 Updated mapping saved to outputs/attribute-mapping.json`);

        // Show remaining not found
        const stillMissing = existingMapping.filter(m => m.status === 'NOT_FOUND');
        if (stillMissing.length > 0) {
            console.log(`\n⚠️  Still Missing (${stillMissing.length}):`);
            stillMissing.forEach(item => console.log(`   - ${item.userLabel}`));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateMapping();
