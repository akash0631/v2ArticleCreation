CREATE TABLE IF NOT EXISTS excel_column_attribute_mapping (
  id BIGSERIAL PRIMARY KEY,
  column_name VARCHAR(255) NOT NULL UNIQUE,
  normalized_column VARCHAR(255) NOT NULL,
  attribute_id INT NULL,
  attribute_key VARCHAR(100) NULL,
  attribute_label VARCHAR(200) NULL,
  mapped_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_excel_col_map_attr ON excel_column_attribute_mapping(attribute_id);
