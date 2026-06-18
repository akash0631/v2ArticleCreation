/**
 * set-attribute-groups.ts
 * Sets the `group` field on MasterAttribute rows based on the article card layout.
 * Run: npx ts-node scripts/set-attribute-groups.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// schemaKey → card group
const KEY_TO_GROUP: Record<string, string> = {
  // FAB
  yarn_01:           'FAB',
  main_mvgr:         'FAB',
  fabric_main_mvgr:  'FAB',
  weave:             'FAB',
  m_fab2:            'FAB',
  composition:       'FAB',
  f_count:           'FAB',
  f_construction:    'FAB',
  lycra_non_lycra:   'FAB',
  finish:            'FAB',
  gsm:               'FAB',
  f_ounce:           'FAB',
  f_width:           'FAB',
  shade:             'FAB',
  weight:            'FAB',

  // BODY
  collar:            'BODY',
  collar_style:      'BODY',
  neck_details:      'BODY',
  neck:              'BODY',
  placket:           'BODY',
  father_belt:       'BODY',
  child_belt:        'BODY',
  sleeve:            'BODY',
  sleeve_fold:       'BODY',
  bottom_fold:       'BODY',
  no_of_pocket:      'BODY',
  pocket_type:       'BODY',
  extra_pocket:      'BODY',
  fit:               'BODY',
  body_style:        'BODY',
  length:            'BODY',
  front_open_style:  'BODY',

  // VA ACC.
  drawcord:          'VA ACC.',
  dc_shape:          'VA ACC.',
  button:            'VA ACC.',
  btn_colour:        'VA ACC.',
  zipper:            'VA ACC.',
  zip_colour:        'VA ACC.',
  patches_type:      'VA ACC.',
  patches:           'VA ACC.',
  htrf_type:         'VA ACC.',
  htrf_style:        'VA ACC.',

  // VA PRCS
  print_type:        'VA PRCS',
  print_style:       'VA PRCS',
  print_placement:   'VA PRCS',
  embroidery:        'VA PRCS',
  embroidery_type:   'VA PRCS',
  emb_placement:     'VA PRCS',
  wash:              'VA PRCS',

  // BUSINESS
  age_group:              'BUSINESS',
  article_fashion_type:   'BUSINESS',
  segment:                'BUSINESS',
  mvgr_brand_vendor:      'BUSINESS',
  macro_mvgr:             'BUSINESS',
  imp_atrbt2:             'BUSINESS',
  fab_div:                'BUSINESS',
};

async function main() {
  let updated = 0;
  for (const [key, group] of Object.entries(KEY_TO_GROUP)) {
    const result = await prisma.masterAttribute.updateMany({
      where: { key },
      data: { group },
    });
    if (result.count > 0) {
      console.log(`  ✅ ${key} → ${group}`);
      updated += result.count;
    } else {
      console.log(`  ⚠  ${key} — not found in DB`);
    }
  }
  console.log(`\n✅ Done. Updated ${updated} attributes.`);
}

main()
  .catch(err => { console.error('❌ Error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
