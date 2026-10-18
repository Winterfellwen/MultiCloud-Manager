-- Phase 5: Silence/Maintenance windows
CREATE TABLE IF NOT EXISTS silence_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(256) NOT NULL,
  rule_ids jsonb DEFAULT '[]',        -- [] = all rules
  instance_ids jsonb DEFAULT '[]',     -- [] = all instances
  match_expression jsonb,              -- optional: { metric: '>', condition: '> 85' }
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  reason text,
  created_by varchar(128),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Composite alert conditions: add conditions and condition_operator to alert_rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS conditions jsonb DEFAULT '[]';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS condition_operator varchar(8) DEFAULT 'AND';

-- Alert cooldowns: track last resolved time for dedup
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;
