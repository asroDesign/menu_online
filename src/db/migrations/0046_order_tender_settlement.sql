BEGIN;

ALTER TABLE orders
  ADD COLUMN payment_breakdown jsonb;

ALTER TABLE pos_requests
  ADD COLUMN settlement_plan jsonb;

ALTER TABLE devices
  ADD COLUMN terminal_number text NOT NULL DEFAULT '';

ALTER TABLE transactions
  ADD COLUMN pos_device_id integer REFERENCES devices(id) ON DELETE SET NULL;

CREATE INDEX transactions_business_pos_device_idx
  ON transactions (business_id, pos_device_id, date DESC)
  WHERE pos_device_id IS NOT NULL;

COMMIT;
