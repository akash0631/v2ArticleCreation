-- Add new MVGR and Weave 2 columns to extraction_results_flat table

ALTER TABLE extraction_results_flat
ADD COLUMN IF NOT EXISTS macro_mvgr VARCHAR(100),
ADD COLUMN IF NOT EXISTS macro_mvgr_full_form VARCHAR(200),
ADD COLUMN IF NOT EXISTS main_mvgr VARCHAR(100),
ADD COLUMN IF NOT EXISTS main_mvgr_full_form VARCHAR(200),
ADD COLUMN IF NOT EXISTS weave_2 VARCHAR(100),
ADD COLUMN IF NOT EXISTS weave_2_full_form VARCHAR(200),
ADD COLUMN IF NOT EXISTS weave_full_form VARCHAR(200);

-- Add indexes for the new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_macro_mvgr ON extraction_results_flat(macro_mvgr);
CREATE INDEX IF NOT EXISTS idx_main_mvgr ON extraction_results_flat(main_mvgr);
CREATE INDEX IF NOT EXISTS idx_weave_2 ON extraction_results_flat(weave_2);
