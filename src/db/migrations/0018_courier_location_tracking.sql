BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_revoked_at timestamptz;
UPDATE orders SET tracking_expires_at = created_at + interval '7 days'
WHERE tracking_token_hash IS NOT NULL AND tracking_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_tracking_expiry_idx ON orders (tracking_expires_at) WHERE tracking_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS courier_locations (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  courier_id integer NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision NOT NULL CHECK (accuracy_meters BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, courier_id)
);
CREATE INDEX IF NOT EXISTS courier_locations_updated_idx ON courier_locations (business_id, updated_at);
COMMIT;
