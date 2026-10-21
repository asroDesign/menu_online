BEGIN;
CREATE TABLE IF NOT EXISTS order_status_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order', 'payment', 'delivery')),
  from_value text,
  to_value text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_events_business_order_time_idx ON order_status_events (business_id, order_id, created_at);
COMMIT;
