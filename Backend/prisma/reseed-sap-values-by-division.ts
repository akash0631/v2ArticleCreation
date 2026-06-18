/**
 * reseed-sap-values-by-division.ts
 *
 * Restores sapAttributeValue to division-scoped rows (MENS / LADIES / KIDS).
 * Aggregates values from maj-cat-attribute-values.json across all categories
 * per division and deduplicates.
 *
 * Run:
 *   npx ts-node --project tsconfig.json prisma/reseed-sap-values-by-division.ts
 */

import { PrismaClient } from '../src/generated/prisma';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const majCatAttrValues = require('../src/data/maj-cat-attribute-values.json') as Record<string, Record<string, string[]>>;

const prisma = new PrismaClient();

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

function getDivision(majorCategory: string): string {
    const mc = majorCategory.toUpperCase();
    if (mc.startsWith('MW_') || mc.startsWith('M_')) return 'MENS';
    if (mc.startsWith('LW_') || mc.startsWith('L_')) return 'LADIES';
    return 'KIDS';
}

async function main() {
    const allData = majCatAttrValues;

    // Build: division → dbField → Set<value>
    const divisionMap: Record<string, Record<string, Set<string>>> = {
        MENS: {}, LADIES: {}, KIDS: {},
    };

    for (const [majorCategory, catData] of Object.entries(allData)) {
        const division = getDivision(majorCategory);
        for (const [excelCol, values] of Object.entries(catData)) {
            const dbField = EXCEL_COL_TO_DB_FIELD[excelCol];
            if (!dbField || !Array.isArray(values)) continue;
            if (!divisionMap[division][dbField]) divisionMap[division][dbField] = new Set();
            for (const v of values) {
                const trimmed = v?.toString().trim();
                if (trimmed && trimmed !== '-') divisionMap[division][dbField].add(trimmed);
            }
        }
    }

    const fieldConfigs = await prisma.sapFieldConfig.findMany({ select: { id: true, dbField: true } });
    const dbFieldToId = new Map(fieldConfigs.map(f => [f.dbField, f.id]));

    const deleted = await prisma.sapAttributeValue.deleteMany({});
    console.log(`🗑  Deleted ${deleted.count} existing rows`);

    let totalInserted = 0;
    for (const [division, fields] of Object.entries(divisionMap)) {
        const rows: { fieldConfigId: number; value: string; majorCategory: string; displayOrder: number; isActive: boolean }[] = [];
        for (const [dbField, valueSet] of Object.entries(fields)) {
            const fieldConfigId = dbFieldToId.get(dbField);
            if (!fieldConfigId) continue;
            let order = 0;
            for (const value of Array.from(valueSet)) {
                rows.push({ fieldConfigId, value, majorCategory: division, displayOrder: order++, isActive: true });
            }
        }
        const result = await prisma.sapAttributeValue.createMany({ data: rows, skipDuplicates: true });
        totalInserted += result.count;
        console.log(`   ${division}: ${result.count} rows`);
    }

    console.log(`\n✅ Done. Total inserted: ${totalInserted}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
