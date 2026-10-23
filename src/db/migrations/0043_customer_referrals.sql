BEGIN;

ALTER TABLE customers
  ADD COLUMN referral_code text,
  ADD COLUMN referred_by_customer_id integer REFERENCES customers(id) ON DELETE SET NULL;

UPDATE customers
SET referral_code = 'C' || id::text || '-' || business_id::text
WHERE referral_code IS NULL;

ALTER TABLE customers
  ALTER COLUMN referral_code SET DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX customers_business_referral_code_idx
  ON customers (business_id, referral_code);
CREATE INDEX customers_business_referrer_idx
  ON customers (business_id, referred_by_customer_id)
  WHERE referred_by_customer_id IS NOT NULL;

CREATE INDEX orders_customer_paid_analytics_idx
  ON orders (business_id, customer_id, created_at)
  WHERE status = 'paid' AND payment_status = 'paid' AND deleted_at IS NULL AND customer_id IS NOT NULL;

COMMIT;
