-- ============================================================
-- COMPLETE SAFE MIGRATION: Add ALL missing columns to
--                          extraction_results_flat table
--
-- Compares the original table creation SQL against the current
-- Prisma schema and adds every column that was missing.
--
-- PostgreSQL / Supabase compatible.
-- Uses IF NOT EXISTS so it is SAFE to run multiple times.
-- NO rows are deleted or modified.
--
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- SECTION 1: Sub-Division (missed in original CREATE TABLE)
-- ============================================================
ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS sub_division VARCHAR(100) DEFAULT NULL;

-- ============================================================
-- SECTION 2: Approval Workflow Columns
-- ============================================================
-- Enum type for approval status (create only if not already there)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS approval_status approval_status NOT NULL DEFAULT 'PENDING';

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS approved_by INTEGER DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- SECTION 3: SAP Sync Columns
-- ============================================================
-- Enum type for SAP sync status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sap_sync_status') THEN
    CREATE TYPE sap_sync_status AS ENUM ('NOT_SYNCED', 'PENDING', 'SYNCED', 'FAILED');
  END IF;
END $$;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS sap_sync_status sap_sync_status NOT NULL DEFAULT 'NOT_SYNCED';

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS sap_article_id VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS sap_sync_message TEXT DEFAULT NULL;

-- ============================================================
-- SECTION 4: Business / SAP Fields
-- (These may already exist if add_business_columns.sql was run.
--  IF NOT EXISTS makes this safe either way.)
-- ============================================================
ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS vendor_code VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS mrp DECIMAL(10, 2) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS mc_code VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS segment VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS season VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS hsn_tax_code VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS article_description TEXT DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS fashion_grid VARCHAR(100) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS year VARCHAR(20) DEFAULT NULL;

ALTER TABLE extraction_results_flat
  ADD COLUMN IF NOT EXISTS article_type VARCHAR(100) DEFAULT NULL;

-- ============================================================
-- SECTION 5: Foreign Key for approved_by → users(id)
-- (Only add if not already present)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'extraction_results_flat_approved_by_fkey'
      AND table_name = 'extraction_results_flat'
  ) THEN
    ALTER TABLE extraction_results_flat
      ADD CONSTRAINT extraction_results_flat_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- SECTION 6: Indexes for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS extraction_results_flat_approval_status_idx
  ON extraction_results_flat (approval_status);

CREATE INDEX IF NOT EXISTS extraction_results_flat_sap_sync_status_idx
  ON extraction_results_flat (sap_sync_status);

-- ============================================================
-- VERIFICATION: List all columns in the table
-- ============================================================
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'extraction_results_flat'
ORDER BY ordinal_position;
