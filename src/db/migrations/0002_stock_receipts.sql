BEGIN;
CREATE TABLE IF NOT EXISTS stock_receipts (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  type text NOT NULL,
  date timestamptz NOT NULL,
  invoice_no text NOT NULL DEFAULT '',
  supplier_id integer,
  subtotal bigint NOT NULL DEFAULT 0,
  discount bigint NOT NULL DEFAULT 0,
  extra_cost bigint NOT NULL DEFAULT 0,
  total bigint NOT NULL DEFAULT 0,
  paid_amount bigint NOT NULL DEFAULT 0,
  pay_from text NOT NULL DEFAULT 'cash',
  document_id integer,
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_receipts_request_idx ON stock_receipts(business_id, request_key);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS receipt_id integer REFERENCES stock_receipts(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS amount bigint NOT NULL DEFAULT 0;
COMMIT;
