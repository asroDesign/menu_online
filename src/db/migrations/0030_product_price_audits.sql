BEGIN;

CREATE TABLE product_price_audits (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  previous_price integer NOT NULL CHECK (previous_price >= 0),
  new_price integer NOT NULL CHECK (new_price >= 0),
  unit_cost bigint NOT NULL CHECK (unit_cost >= 0),
  target_type text NOT NULL CHECK (target_type IN ('food_cost', 'gross_margin')),
  target_percent integer NOT NULL CHECK (target_percent BETWEEN 1 AND 99),
  yield_ratio double precision NOT NULL CHECK (yield_ratio > 0 AND yield_ratio <= 1),
  source_snapshot_hash text NOT NULL,
  cost_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_price_audits_business_product_time_idx ON product_price_audits (business_id, product_id, created_at);

COMMIT;
