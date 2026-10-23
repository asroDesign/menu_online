BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM customers WHERE referred_by_customer_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Refusing to remove customer referral attribution; archive referral analytics before rollback';
  END IF;
END $$;

DROP INDEX IF EXISTS customers_business_referrer_idx;
DROP INDEX IF EXISTS customers_business_referral_code_idx;
DROP INDEX IF EXISTS orders_customer_paid_analytics_idx;
ALTER TABLE customers DROP COLUMN referred_by_customer_id, DROP COLUMN referral_code;
COMMIT;
