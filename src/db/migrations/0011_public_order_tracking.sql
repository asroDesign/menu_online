-- Existing orders remain untrackable; only new public customer and kiosk orders receive a random-token hash.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_hash_idx ON orders (tracking_token_hash);
COMMIT;
