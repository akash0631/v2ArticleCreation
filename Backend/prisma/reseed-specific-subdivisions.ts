import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const DIVISIONS = {
    MEN: {
        description: 'Men\'s Fashion',
        subDivisions: [
            { code: 'MU', name: 'MEN UPPER' },
            { code: 'MS-U', name: 'MEN SPORTS UPPER' },
            { code: 'MS-L', name: 'MEN SPORTS LOWER' },
            { code: 'MW', name: 'MEN WINTERWEAR' },
            { code: 'MO', name: 'MEN OUTERWEAR' },
            { code: 'MS-IW', name: 'MEN INNERWEAR' },
            { code: 'ML', name: 'MEN LOWER' }
        ]
    },
    LADIES: {
        description: 'Ladies Fashion',
        subDivisions: [
            { code: 'LU', name: 'LADIES UPPER' },
            { code: 'LL', name: 'LADIES LOWER' },
            { code: 'LK&L', name: 'LADIES KURTI AND LEGGINGS' },
            { code: 'LN&L', name: 'LADIES NIGHTY AND LINGERIE' },
            { code: 'LW', name: 'LADIES WINTERWEAR' }
        ]
    },
    KIDS: {
        description: 'Kids Fashion',
        subDivisions: [
            { code: 'KB-SETS', name: 'KID BOYS SETS' },
            { code: 'KB-L', name: 'KID BOYS LOWER' },
            { code: 'KB-U', name: 'KID BOYS UPPER' },
            { code: 'KBW-U', name: 'KID BOYS WINTER UPPER' },
            { code: 'KBW-L', name: 'KID BOYS WINTER LOWER' },
            { code: 'KBW-SETS', name: 'KID BOYS WINTER SETS' },
            { code: 'KG-L', name: 'KID GIRLS LOWER' },
            { code: 'KG-U', name: 'KID GIRLS UPPER' },
            { code: 'KGW-U', name: 'KID GIRLS WINTER UPPER' },
            { code: 'KGW-L', name: 'KID GIRLS WINTER LOWER' },
            { code: 'IB', name: 'INFANT BOYS' },
            { code: 'IG', name: 'INFANT GIRLS' },
            { code: 'KI', name: 'KID INFANTS' },
            { code: 'KIW', name: 'KID INFANTS WINTER' },
            { code: 'KB', name: 'KID BOYS' },
            { code: 'KBW', name: 'KID BOYS WINTER' },
            { code: 'KG', name: 'KID GIRLS' }
        ]
    }
};

async function main() {
    console.log('🌱 Starting Specific Hierarchy Seeding...');

    // 1. Ensure clean slate (Safe since we just ran delete script, but good practice)
    await prisma.category.deleteMany({});
    await prisma.subDepartment.deleteMany({});
    await prisma.department.deleteMany({});

    for (const [deptCode, deptData] of Object.entries(DIVISIONS)) {
        console.log(`\n📌 Creating Division: ${deptCode}`);

        // Create Division (Department)
        const department = await prisma.department.create({
            data: {
                code: deptCode,
                name: deptCode,
                description: deptData.description,
                isActive: true
            }
        });

        // Create Sub-Divisions (SubDepartments)
        for (const sub of deptData.subDivisions) {
            console.log(`   ↳ Sub-Division: ${sub.name} (${sub.code})`);

            const subDept = await prisma.subDepartment.create({
                data: {
                    departmentId: department.id,
                    code: sub.code,
                    name: sub.name,
                    isActive: true
                }
            });

            // Create "General" Category for compatibility
            await prisma.category.create({
                data: {
                    subDepartmentId: subDept.id,
                    code: `${deptCode}_${sub.code}_GENERAL`.toUpperCase(),
                    name: `${sub.name} General`,
                    isActive: true
                }
            });
        }
    }

    console.log('\n✅ Specific hierarchy seeding complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
