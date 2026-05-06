import { PrismaClient } from './src/generated/prisma/index.js';
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.$queryRaw`
    SELECT 
      COUNT(*)::int as total,
      COUNT(CASE WHEN image_url IS NULL THEN 1 END)::int as no_image,
      COUNT(CASE WHEN image_url LIKE '%r2.dev%' OR image_url LIKE '%r2.cloudflarestorage.com%' THEN 1 END)::int as r2_corrupted,
      COUNT(CASE WHEN image_url LIKE '%api.v2retail.com%' THEN 1 END)::int as correct_supabase,
      COUNT(CASE WHEN image_url IS NOT NULL AND image_url NOT LIKE '%api.v2retail.com%' AND image_url NOT LIKE '%r2.%' THEN 1 END)::int as other_url
    FROM public.extraction_results_flat
    WHERE source = 'SRM'
  `;
  console.log(JSON.stringify(rows, (_, v) => typeof v === 'bigint' ? Number(v) : v));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
