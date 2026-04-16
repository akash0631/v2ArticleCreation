/**
 * Migration: Update WEAVE & M_FAB2 (WEAVE_2) allowed values
 * 1. Remove HRY from WEAVE
 * 2. Add HRY to M_FAB2 (WEAVE_2)
 * 3. Add RANGILA_SLK, FENDY_SLK, GLASS_SLK, VICHITRA to WEAVE
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Starting WEAVE / M_FAB2 attribute update...');

    // Find WEAVE attribute
    const weaveAttr = await prisma.masterAttribute.findFirst({
        where: { key: { in: ['weave', 'WEAVE'] } },
        include: { allowedValues: true }
    });
    if (!weaveAttr) throw new Error('WEAVE attribute not found');
    console.log(`✅ Found WEAVE (id=${weaveAttr.id}) with ${weaveAttr.allowedValues.length} values`);

    // Find M_FAB2 attribute (stored as WEAVE_2 or M_FAB2 or mFab2)
    const mfab2Attr = await prisma.masterAttribute.findFirst({
        where: { key: { in: ['M_FAB2', 'WEAVE_2', 'mFab2', 'm_fab2'] } },
        include: { allowedValues: true }
    });
    if (!mfab2Attr) throw new Error('M_FAB2 attribute not found');
    console.log(`✅ Found M_FAB2 (id=${mfab2Attr.id}) with ${mfab2Attr.allowedValues.length} values`);

    // 1. Remove HRY from WEAVE
    const hryInWeave = weaveAttr.allowedValues.find(v => v.shortForm === 'HRY');
    if (hryInWeave) {
        await prisma.attributeAllowedValue.delete({ where: { id: hryInWeave.id } });
        console.log(`🗑️  Removed HRY from WEAVE`);
    } else {
        console.log(`ℹ️  HRY not found in WEAVE (already removed?)`);
    }

    // 2. Add HRY to M_FAB2 (if not already there)
    const hryInMfab2 = mfab2Attr.allowedValues.find(v => v.shortForm === 'HRY');
    if (!hryInMfab2) {
        await prisma.attributeAllowedValue.create({
            data: { attributeId: mfab2Attr.id, shortForm: 'HRY', fullForm: 'HAIRY', isActive: true }
        });
        console.log(`✅ Added HRY to M_FAB2`);
    } else {
        console.log(`ℹ️  HRY already exists in M_FAB2`);
    }

    // 3. Add new WEAVE values
    const newWeaveValues = [
        { shortForm: 'RANGILA_SLK', fullForm: 'RANGILA SILK' },
        { shortForm: 'FENDY_SLK',   fullForm: 'FENDY SILK' },
        { shortForm: 'GLASS_SLK',   fullForm: 'GLASS SILK' },
        { shortForm: 'VICHITRA',    fullForm: 'VICHITRA' },
    ];

    // Re-fetch WEAVE values after deletion
    const updatedWeave = await prisma.masterAttribute.findUnique({
        where: { id: weaveAttr.id },
        include: { allowedValues: true }
    });

    for (const val of newWeaveValues) {
        const exists = updatedWeave?.allowedValues.find(v => v.shortForm === val.shortForm);
        if (!exists) {
            await prisma.attributeAllowedValue.create({
                data: { attributeId: weaveAttr.id, shortForm: val.shortForm, fullForm: val.fullForm, isActive: true }
            });
            console.log(`✅ Added ${val.shortForm} (${val.fullForm}) to WEAVE`);
        } else {
            console.log(`ℹ️  ${val.shortForm} already exists in WEAVE`);
        }
    }

    console.log('\n✅ Done! Summary:');
    console.log('   WEAVE: removed HRY, added RANGILA_SLK / FENDY_SLK / GLASS_SLK / VICHITRA');
    console.log('   M_FAB2: added HRY (HAIRY)');
}

main()
    .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
