/**
 * seed-sap-attribute-values-from-json.ts
 *
 * Replaces sapAttributeValue table content with values sourced directly from
 * maj-cat-attribute-values.json, scoped per major category (e.g. MW_TEES_FS).
 *
 * This ensures the UI dropdowns and backend validation use identical SAP class
 * values, eliminating format mismatches like "2W_LYC" vs "2 WAY LYCRA".
 *
 * Run:
 *   npx ts-node --project tsconfig.json prisma/seed-sap-attribute-values-from-json.ts
 *
 * IMPORTANT: This deletes all existing sapAttributeValue rows before re-seeding.
 */

import { PrismaClient } from '../src/generated/prisma';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const majCatAttrValues = require('../src/data/maj-cat-attribute-values.json') as Record<string, Record<string, string[]>>;

const prisma = new PrismaClient();

// ─── Excel column → DB camelCase field name ───────────────────────────────────
// Derived from Frontend/src/data/majCatAttributeMap.ts
// (SCHEMA_KEY_TO_EXCEL_ATTR + SCHEMA_KEY_TO_DB_FIELD composed)

const EXCEL_COL_TO_DB_FIELD: Record<string, string> = {
    'OTHER MVGR':              'macroMvgr',
    'F_FABRIC MAIN MVGR-01':   'mainMvgr',
    'F_YARN':                  'yarn1',
    'F_FABRIC MAIN MVGR-02':   'fabricMainMvgr',
    'F_WEAVE_01':              'weave',
    'F_WEAVE_02':              'mFab2',
    'F_COMP':                  'composition',
    'F_FINISH':                'finish',
    'F_GSM_GLM':               'gsm',
    'F_STRETCH':               'lycra',
    'F_COUNT':                 'fCount',
    'F_CONSTRUCTION':          'fConstruction',
    'F_OUNCE':                 'fOunce',
    'F_WIDTH':                 'fWidth',
    'F_UOM':                   'fUom',
    'COLLAR TYPE':             'collar',
    'COLLAR STYLE':            'collarStyle',
    'POCKET TYPE':             'pocketType',
    'NO. OF POCKET':           'noOfPocket',
    'EXTRA POCKET':            'extraPocket',
    'PLACKET':                 'placket',
    'BOTTOM FOLD':             'bottomFold',
    'NECK TYPE':               'neck',
    'NECK STYLE':              'neckDetails',
    'SLEEVE':                  'sleeve',
    'SLEEVE FOLD':             'sleeveFold',
    'FIT':                     'fit',
    'BODY STYLE':              'bodyStyle',
    'LENGTH':                  'length',
    'BTN_TYPE':                'button',
    'BTN_CLR':                 'btnColour',
    'DC_TYPE':                 'drawcord',
    'DC_SHAPE':                'dcShape',
    'ZIP_TYPE':                'zipper',
    'ZIP_CLR':                 'zipColour',
    'PATCH_TYPE':              'patches',
    'PATCH_STYLE':             'patchesType',
    'HTRF_TYPE':               'htrfType',
    'HTRF_STYLE':              'htrfStyle',
    'EMB_TYPE':                'embroidery',
    'EMB_STYLE':               'embroideryType',
    'EMB_PLACEMENT':           'embPlacement',
    'PRT_TYPE':                'printType',
    'PRT_PLCMNT':              'printPlacement',
    'PRT_STYLE':               'printStyle',
    'WASH':                    'wash',
    'AGE GROUP':               'ageGroup',
    'SEGMENT':                 'segment',
    'ARTICLE FASHION TYPE':    'articleFashionType',
    'BELT':                    'fatherBelt',
    'BELT STYLE':              'childBelt',
    'FO BTN STYLE':            'frontOpenStyle',
};

// Columns that carry no real SAP values (numeric/free-text/placeholder-only) — skip
const SKIP_COLS = new Set(['MRP', 'ARTICLE WEIGHT', 'ARTICLE DIMENSION', 'F_UOM']);

async function main() {
    const allData = majCatAttrValues;
    const majorCategories = Object.keys(allData);

    console.log(`\n📦 Seeding sapAttributeValue from maj-cat-attribute-values.json`);
    console.log(`   Major categories: ${majorCategories.length}`);

    // ── 1. Load all fieldConfigs (dbField → id) ───────────────────────────────
    const fieldConfigs = await prisma.sapFieldConfig.findMany({
        select: { id: true, dbField: true },
    });
    const dbFieldToId = new Map<string, number>(
        fieldConfigs.map((fc) => [fc.dbField, fc.id])
    );
    console.log(`   Field configs loaded: ${dbFieldToId.size}`);

    // ── 2. Delete all existing sapAttributeValue rows ─────────────────────────
    const deleted = await prisma.sapAttributeValue.deleteMany({});
    console.log(`\n🗑  Deleted ${deleted.count} existing rows`);

    // ── 3. Build insert batch ─────────────────────────────────────────────────
    let totalInserted = 0;
    let skippedCols = 0;
    let missingFieldConfigs = new Set<string>();

    for (const majorCategory of majorCategories) {
        const catData = allData[majorCategory];
        const rows: {
            fieldConfigId: number;
            value: string;
            majorCategory: string;
            displayOrder: number;
            isActive: boolean;
        }[] = [];

        for (const [excelCol, values] of Object.entries(catData)) {
            if (SKIP_COLS.has(excelCol)) { skippedCols++; continue; }

            const dbField = EXCEL_COL_TO_DB_FIELD[excelCol];
            if (!dbField) {
                // Column exists in JSON but has no DB mapping — safe to skip
                continue;
            }

            const fieldConfigId = dbFieldToId.get(dbField);
            if (!fieldConfigId) {
                missingFieldConfigs.add(dbField);
                continue;
            }

            if (!Array.isArray(values)) continue;

            let order = 0;
            for (const val of values) {
                const trimmed = val?.toString().trim();
                // Skip placeholder dash or empty
                if (!trimmed || trimmed === '-') continue;
                rows.push({
                    fieldConfigId,
                    value: trimmed,
                    majorCategory,
                    displayOrder: order++,
                    isActive: true,
                });
            }
        }

        if (rows.length === 0) continue;

        // createMany with skipDuplicates handles (fieldConfigId, value, majorCategory) conflicts
        const result = await prisma.sapAttributeValue.createMany({
            data: rows,
            skipDuplicates: true,
        });
        totalInserted += result.count;
        process.stdout.write(`\r   Inserted rows: ${totalInserted}`);
    }

    console.log(`\n\n✅ Done.`);
    console.log(`   Total rows inserted : ${totalInserted}`);
    if (missingFieldConfigs.size > 0) {
        console.log(`\n⚠️  DB fields not found in sapFieldConfig (data skipped):`);
        Array.from(missingFieldConfigs).sort().forEach((f) => console.log(`      - ${f}`));
        console.log(`   To fix: add these fields to sapFieldConfig via seed-sap-config.ts`);
    }
}

main()
    .catch((e) => {
        console.error('\n❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
