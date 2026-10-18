-- Phase 6: Budget management
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(128) NOT NULL,
  provider varchar(32) NOT NULL,
  service varchar(64) DEFAULT '',
  amount decimal(12,2) NOT NULL,
  currency varchar(8) DEFAULT 'USD',
  period varchar(16) NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  notify_threshold integer DEFAULT 80,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);
