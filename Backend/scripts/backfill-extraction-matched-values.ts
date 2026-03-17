import { prismaClient as prisma } from '../src/utils/prisma';

async function main(): Promise<void> {
  console.log('🔄 Backfilling extraction_results.matched_value_id from attribute_allowed_values...');

  const updated = await prisma.$executeRawUnsafe(`
    WITH candidates AS (
      SELECT
        er.id AS extraction_result_id,
        aav.id AS allowed_value_id,
        aav.short_form AS allowed_short_form,
        ROW_NUMBER() OVER (
          PARTITION BY er.id
          ORDER BY
            CASE
              WHEN er.raw_value = aav.short_form THEN 1
              WHEN LOWER(TRIM(er.raw_value)) = LOWER(TRIM(aav.short_form)) THEN 2
              WHEN LOWER(TRIM(er.raw_value)) = LOWER(TRIM(aav.full_form)) THEN 3
              ELSE 99
            END,
            aav.id
        ) AS rn
      FROM extraction_results er
      JOIN attribute_allowed_values aav
        ON aav.attribute_id = er.attribute_id
       AND aav.is_active = true
      WHERE er.raw_value IS NOT NULL
        AND TRIM(er.raw_value) <> ''
        AND (er.matched_value_id IS NULL OR er.final_value IS NULL)
        AND (
          er.raw_value = aav.short_form
          OR LOWER(TRIM(er.raw_value)) = LOWER(TRIM(aav.short_form))
          OR LOWER(TRIM(er.raw_value)) = LOWER(TRIM(aav.full_form))
        )
    )
    UPDATE extraction_results er
       SET matched_value_id = c.allowed_value_id,
           final_value = COALESCE(er.final_value, c.allowed_short_form)
      FROM candidates c
     WHERE c.rn = 1
       AND er.id = c.extraction_result_id
       AND (er.matched_value_id IS NULL OR er.final_value IS NULL);
  `);

  console.log(`✅ Backfill complete. Rows updated: ${Number(updated || 0)}`);
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
