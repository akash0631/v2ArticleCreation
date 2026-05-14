import { prismaClient as prisma } from './prisma';

// Cache of columns that actually exist in article_360_flat (populated on first use)
let existingColumns: Set<string> | null = null;

async function getExistingColumns(): Promise<Set<string>> {
    if (existingColumns) return existingColumns;
    try {
        const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = '360article'
              AND table_name   = 'article_360_flat'
        `);
        existingColumns = new Set(rows.map(r => r.column_name));
    } catch {
        existingColumns = new Set(); // fallback: skip all mirror writes
    }
    return existingColumns;
}

/** Maps camelCase approver/extraction fields to 360article.article_360_flat columns */
export const FIELD_TO_360_COL: Record<string, string> = {
    // Identity / header
    articleNumber:               'article_number',
    sapArticleId:                'sap_article_id',
    imageUrl:                    'image_url',

    // Division / category
    division:                    'division',
    subDivision:                 'sub_division',
    majorCategory:               'major_category',
    mcCode:                      'mc_code',
    pptNumber:                   'ppt_number',

    // Vendor / design
    designNumber:                'design_number',
    vendorName:                  'vendor_name',
    vendorCode:                  'vendor_code',
    mvgrBrandVendor:             'mvgr_brand_vendor',

    // Reference
    referenceArticleNumber:      'reference_article_number',
    referenceArticleDescription: 'reference_article_description',

    // Pricing
    rate:                        'rate',
    mrp:                         'mrp',

    // Important attribute
    impAtrbt2:                   'imp_atrbt_2',

    // Fabric
    macroMvgr:                   'macro_mvgr',
    yarn1:                       'yarn_1',
    yarn2:                       'yarn_2',
    mainMvgr:                    'main_mvgr',
    fabricMainMvgr:              'fabric_main_mvgr',
    weave:                       'weave',
    weaveFullForm:               'weave_full_form',
    mFab2:                       'm_fab2',
    mFab2FullForm:               'm_fab2_full_form',
    macroMvgrFullForm:           'macro_mvgr_full_form',
    mainMvgrFullForm:            'main_mvgr_full_form',
    composition:                 'composition',
    fCount:                      'f_count',
    fConstruction:               'f_construction',
    lycra:                       'lycra',
    finish:                      'finish',
    gsm:                         'gsm',
    fOunce:                      'f_ounce',
    fWidth:                      'f_width',
    fabDiv:                      'fab_div',
    shade:                       'shade',
    weight:                      'weight',
    size:                        'size',
    colour:                      'colour',

    // Body
    collar:                      'collar',
    collarStyle:                 'collar_style',
    neck:                        'neck',
    neckDetails:                 'neck_details',
    placket:                     'placket',
    fatherBelt:                  'father_belt',
    childBelt:                   'child_belt',
    sleeve:                      'sleeve',
    sleeveFold:                  'sleeve_fold',
    bottomFold:                  'bottom_fold',
    frontOpenStyle:              'front_open_style',
    noOfPocket:                  'no_of_pocket',
    pocketType:                  'pocket_type',
    extraPocket:                 'extra_pocket',
    fit:                         'fit',
    pattern:                     'body_style',
    length:                      'length',

    // VA Accessories
    drawcord:                    'drawcord',
    dcShape:                     'dc_shape',
    button:                      'button',
    btnColour:                   'btn_colour',
    zipper:                      'zipper',
    zipColour:                   'zip_colour',
    patches:                     'patches',
    patchesType:                 'patches_type',

    // VA Processing
    printType:                   'print_type',
    printStyle:                  'print_style',
    printPlacement:              'print_placement',
    embroidery:                  'embroidery',
    embroideryType:              'embroidery_type',
    embPlacement:                'emb_placement',
    htrfType:                    'htrf_type',
    htrfStyle:                   'htrf_style',
    wash:                        'wash',

    // Business / derived
    // segment intentionally excluded — column does not exist in article_360_flat
    ageGroup:                    'age_group',
    articleFashionType:          'article_fashion_type',
    articleDimension:            'article_dimension',
    season:                      'season',
    hsnTaxCode:                  'hsn_tax_code',
    articleDescription:          'article_description',
    fashionGrid:                 'fashion_grid',
    year:                        'year',
    articleType:                 'article_type',

    // Approval workflow
    approvalStatus:              'approval_status',
    approvedBy:                  'approved_by',
    approvedAt:                  'approved_at',
    sapSyncStatus:               'sap_sync_status',
    sapSyncMessage:              'sap_sync_message',

    // Watcher / source
    source:                      'source',
    imageUncPath:                'image_unc_path',

    // Variants
    isGeneric:                   'is_generic',
    genericArticleId:            'generic_article_id',
    variantSize:                 'variant_size',
    variantColor:                'variant_color',

    // AI metrics
    aiModel:                     'ai_model',
    avgConfidence:               'avg_confidence',
    processingTimeMs:            'processing_time_ms',
    totalAttributes:             'total_attributes',
    extractedCount:              'extracted_count',
    inputTokens:                 'input_tokens',
    outputTokens:                'output_tokens',
    totalTokens:                 'total_tokens',
    apiCost:                     'api_cost',
    extractionDate:              'extraction_date',
};

/** Extra camelCase fields not in FIELD_TO_360_COL that map to 360article columns */
const EXTRA_FIELD_MAP: Record<string, string> = {
    jobId:            'job_id',
    imageName:        'image_name',
    extractionStatus: 'extraction_status',
    userId:           'user_id',
    userName:         'user_name',
    userEmail:        'user_email',
};

const FULL_FIELD_MAP: Record<string, string> = { ...EXTRA_FIELD_MAP, ...FIELD_TO_360_COL };

/**
 * Upsert a full row into "360article"."article_360_flat" from an extractionResultFlat-shaped object.
 * Uses ON CONFLICT (job_id) DO UPDATE. Never throws.
 */
export async function upsert360ArticleFlatRow(
    flatId: string,
    row: Record<string, unknown>
): Promise<void> {
    const realCols = await getExistingColumns();
    // These are hardcoded in the INSERT so must not appear in the dynamic list
    const HARDCODED = new Set(['approval_status', 'sap_sync_status', 'created_at', 'updated_at', 'id', 'flat_id']);
    const cols: string[] = ['"flat_id"'];
    const vals: unknown[] = [flatId];

    for (const [camel, col] of Object.entries(FULL_FIELD_MAP)) {
        if (camel in row && realCols.has(col) && !HARDCODED.has(col)) {
            cols.push(`"${col}"`);
            vals.push(row[camel] ?? null);
        }
    }

    if (!('jobId' in row)) return; // job_id is required for upsert

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const updateParts = cols
        .filter(c => c !== '"flat_id"' && c !== '"job_id"')
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(', ');

    const sql = `
        INSERT INTO "360article"."article_360_flat" (
            id, ${cols.join(', ')}, approval_status, sap_sync_status, created_at, updated_at
        ) VALUES (
            gen_random_uuid()::text, ${placeholders}, 'PENDING', 'NOT_SYNCED', now(), now()
        )
        ON CONFLICT (job_id) DO UPDATE SET ${updateParts}, updated_at = now()
    `;

    try {
        await prisma.$executeRawUnsafe(sql, ...vals);
    } catch (err) {
        console.error('⚠️  360article flat row upsert failed:', err);
    }
}

/**
 * Mirror a partial field update to "360article"."article_360_flat" by flat_id.
 * Never throws — errors are logged and swallowed so the main flow is never affected.
 */
export async function mirror360FlatUpdate(
    flatId: string,
    changes: Record<string, unknown>
): Promise<void> {
    const realCols = await getExistingColumns();
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [camel, value] of Object.entries(changes)) {
        const col = FIELD_TO_360_COL[camel];
        if (!col || !realCols.has(col)) continue;
        values.push(value ?? null);
        sets.push(`"${col}" = $${values.length}`);
    }

    if (sets.length === 0) return;

    values.push(flatId);
    const sql = `
        UPDATE "360article"."article_360_flat"
        SET ${sets.join(', ')}, updated_at = now()
        WHERE flat_id = $${values.length}
    `;

    try {
        await prisma.$executeRawUnsafe(sql, ...values);
    } catch (err) {
        console.error('⚠️  360article flat mirror update failed:', err);
    }
}
