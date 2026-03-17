CREATE TABLE IF NOT EXISTS excel_attribute_values (
  id BIGSERIAL PRIMARY KEY,
  column_name VARCHAR(255) NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value VARCHAR(500) NOT NULL,
  first_seen_file VARCHAR(500) NULL,
  last_seen_file VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(column_name, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_excel_attr_values_column ON excel_attribute_values(column_name);
