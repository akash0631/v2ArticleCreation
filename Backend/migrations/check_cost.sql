-- Check the most recent extraction for cost data
SELECT 
  "imageName",
  "inputTokens",
  "outputTokens",
  "apiCost",
  "tokensUsed",
  "createdAt"
FROM extraction_results_flat
ORDER BY "createdAt" DESC
LIMIT 5;
