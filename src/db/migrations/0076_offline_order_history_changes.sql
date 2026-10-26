BEGIN;

CREATE INDEX IF NOT EXISTS orders_business_updated_history_idx
  ON orders (business_id, updated_at, id);

COMMIT;
