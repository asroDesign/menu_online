ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users(phone) WHERE phone IS NOT NULL;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS coupon_code text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS promo_coupons (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'percent',
  value bigint NOT NULL,
  plan_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redemptions integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_coupons_active_idx ON promo_coupons(is_active);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id text PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES subscription_invoices(id) ON DELETE CASCADE,
  provider text NOT NULL,
  amount bigint NOT NULL,
  token text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  ref_no text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS subscription_payments_invoice_idx ON subscription_payments(invoice_id);
CREATE INDEX IF NOT EXISTS subscription_payments_token_idx ON subscription_payments(provider, token);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_one_pending_idx ON subscription_payments(invoice_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id serial PRIMARY KEY,
  coupon_id integer NOT NULL REFERENCES promo_coupons(id),
  invoice_id integer NOT NULL UNIQUE REFERENCES subscription_invoices(id) ON DELETE CASCADE,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  discount bigint NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id text PRIMARY KEY,
  phone text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  name text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_phone_idx ON otp_challenges(phone, created_at);

CREATE TABLE IF NOT EXISTS platform_sms_campaigns (
  id serial PRIMARY KEY,
  title text NOT NULL,
  occasion text NOT NULL DEFAULT 'campaign',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_sms_logs (
  id serial PRIMARY KEY,
  business_id integer REFERENCES businesses(id) ON DELETE SET NULL,
  phone text NOT NULL,
  kind text NOT NULL,
  period_key text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  status text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_sms_logs_created_idx ON platform_sms_logs(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS platform_sms_logs_dedupe_idx ON platform_sms_logs(business_id, kind, period_key) WHERE business_id IS NOT NULL;
