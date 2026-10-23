BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE payment_breakdown IS NOT NULL)
    OR EXISTS (SELECT 1 FROM pos_requests WHERE settlement_plan IS NOT NULL)
    OR EXISTS (SELECT 1 FROM transactions WHERE pos_device_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM devices WHERE terminal_number <> '') THEN
    RAISE EXCEPTION 'Cannot roll back order tender settlement while payment or POS details exist';
  END IF;
END $$;

DROP INDEX transactions_business_pos_device_idx;
ALTER TABLE transactions DROP COLUMN pos_device_id;
ALTER TABLE pos_requests DROP COLUMN settlement_plan;
ALTER TABLE orders DROP COLUMN payment_breakdown;
ALTER TABLE devices DROP COLUMN terminal_number;

COMMIT;
