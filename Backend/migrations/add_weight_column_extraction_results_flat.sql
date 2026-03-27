-- Add new weight column to extraction_results_flat
ALTER TABLE extraction_results_flat
ADD COLUMN IF NOT EXISTS weight VARCHAR(100) NULL;