-- Add topology column to cloud_resources
ALTER TABLE cloud_resources ADD COLUMN IF NOT EXISTS topology JSONB;
