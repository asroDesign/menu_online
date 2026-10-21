-- Privacy-minimizing menu funnel events; no customer identity, IP, or user-agent is persisted.
BEGIN;
CREATE TABLE IF NOT EXISTS menu_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL,
  category_id integer,
  product_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS menu_events_business_event_idx ON menu_events (business_id, event_id);
CREATE INDEX IF NOT EXISTS menu_events_business_created_idx ON menu_events (business_id, created_at);
COMMIT;
