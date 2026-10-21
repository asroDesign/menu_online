BEGIN;

CREATE TABLE sms_retention_rules (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  trigger_type text NOT NULL CHECK (trigger_type IN ('inactive_days', 'segment_enter', 'segment_exit')),
  inactive_days integer CHECK (inactive_days BETWEEN 1 AND 365),
  segment_key text CHECK (segment_key IN ('vip', 'loyal', 'regular', 'new', 'at_risk', 'lost', 'none')),
  template_id integer NOT NULL REFERENCES sms_templates(id) ON DELETE RESTRICT,
  cooldown_days integer NOT NULL DEFAULT 30 CHECK (cooldown_days BETWEEN 1 AND 90),
  max_marketing_sms_30_days integer NOT NULL DEFAULT 4 CHECK (max_marketing_sms_30_days BETWEEN 1 AND 20),
  send_hour_tehran integer NOT NULL DEFAULT 10 CHECK (send_hour_tehran BETWEEN 0 AND 23),
  attribution_days integer NOT NULL DEFAULT 7 CHECK (attribution_days BETWEEN 1 AND 30),
  discount_code text NOT NULL DEFAULT '',
  discount_label text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  scan_cursor_customer_id integer NOT NULL DEFAULT 0 CHECK (scan_cursor_customer_id >= 0),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((trigger_type = 'inactive_days' AND inactive_days IS NOT NULL AND segment_key IS NULL)
      OR (trigger_type IN ('segment_enter', 'segment_exit') AND inactive_days IS NULL AND segment_key IS NOT NULL))
);
CREATE INDEX sms_retention_rules_business_active_idx ON sms_retention_rules (business_id, is_active, id);

CREATE TABLE sms_retention_members (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rule_id integer NOT NULL REFERENCES sms_retention_rules(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  current_segment text NOT NULL CHECK (current_segment IN ('vip', 'loyal', 'regular', 'new', 'at_risk', 'lost', 'none')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, rule_id, customer_id)
);
CREATE INDEX sms_retention_members_customer_idx ON sms_retention_members (business_id, customer_id);

CREATE TABLE sms_retention_deliveries (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rule_id integer NOT NULL REFERENCES sms_retention_rules(id) ON DELETE RESTRICT,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  trigger_key text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('inactive_days', 'segment_enter', 'segment_exit')),
  anchor_order_at timestamptz,
  expected_segment text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'skipped', 'failed', 'uncertain')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  scheduled_at timestamptz NOT NULL,
  claimed_at timestamptz,
  sent_at timestamptz,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, rule_id, customer_id, trigger_key)
);
CREATE INDEX sms_retention_delivery_due_idx ON sms_retention_deliveries (business_id, status, scheduled_at);
CREATE INDEX sms_retention_delivery_customer_sent_idx ON sms_retention_deliveries (business_id, customer_id, sent_at);

COMMIT;
