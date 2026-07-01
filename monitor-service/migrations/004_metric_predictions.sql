-- monitor-service/migrations/004_metric_predictions.sql
CREATE TABLE IF NOT EXISTS metric_predictions (
  id SERIAL PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  metric_name VARCHAR(64) NOT NULL,
  current_value DECIMAL(12,4) NOT NULL,
  predicted_value DECIMAL(12,4) NOT NULL,
  threshold DECIMAL(12,4) NOT NULL,
  hours_to_threshold DECIMAL(8,2) NOT NULL,
  slope DECIMAL(12,6) NOT NULL,
  confidence DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_instance ON metric_predictions(instance_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON metric_predictions(created_at DESC);
