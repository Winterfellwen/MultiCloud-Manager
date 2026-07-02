-- Add topology and updated_at columns to cloud_resources
ALTER TABLE cloud_resources ADD COLUMN IF NOT EXISTS topology JSONB;
ALTER TABLE cloud_resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
