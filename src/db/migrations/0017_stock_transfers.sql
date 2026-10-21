BEGIN;
CREATE TABLE IF NOT EXISTS stock_transfers (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text NOT NULL DEFAULT '',
  created_by integer NOT NULL REFERENCES users(id),
  decided_by integer REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, request_key)
);
CREATE INDEX IF NOT EXISTS stock_transfers_business_status_idx ON stock_transfers (business_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id serial PRIMARY KEY,
  transfer_id integer NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  source_item_id integer NOT NULL REFERENCES inventory_items(id),
  destination_item_id integer NOT NULL REFERENCES inventory_items(id),
  quantity double precision NOT NULL CHECK (quantity > 0),
  unit_cost integer NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  CHECK (source_item_id <> destination_item_id)
);
COMMIT;
