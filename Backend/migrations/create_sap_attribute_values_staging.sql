-- Staging table for SAP attribute sync snapshots
-- Append-only; new unique values are inserted on each run.

CREATE TABLE IF NOT EXISTS sap_attribute_values_staging (
  id BIGSERIAL PRIMARY KEY,
  sync_run_id VARCHAR(64) NOT NULL,
  sap_column VARCHAR(150) NOT NULL,
  sap_value VARCHAR(500) NOT NULL,
  normalized_value VARCHAR(500) NOT NULL,
  attribute_id INT NULL,
  attribute_key VARCHAR(100) NULL,
  source_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sap_attr_stage_run ON sap_attribute_values_staging(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sap_attr_stage_attr ON sap_attribute_values_staging(attribute_id);
CREATE INDEX IF NOT EXISTS idx_sap_attr_stage_lookup ON sap_attribute_values_staging(sap_column, normalized_value, attribute_id);
