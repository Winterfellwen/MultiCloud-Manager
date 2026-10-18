-- 性能优化：metric 查询复合索引
-- 查询模式（monitor-service/src/services/metric.service.ts）：
--   WHERE instance_id = ? [AND metric_name = ?] [AND recorded_at BETWEEN ? AND ?]
--   ORDER BY recorded_at DESC LIMIT n
-- 原索引 idx_metrics_instance_time(instance_id, recorded_at) 在带 metric_name
-- 过滤时需回表过滤；三列复合索引可覆盖全部过滤条件并直接提供排序。
CREATE INDEX IF NOT EXISTS idx_metrics_instance_name_time
  ON metrics(instance_id, metric_name, recorded_at DESC);
