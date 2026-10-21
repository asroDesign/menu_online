-- Platform funnel events contain only random event IDs, a fixed event name and time.
BEGIN;
CREATE TABLE IF NOT EXISTS platform_events (
  id serial PRIMARY KEY,
  event_id text NOT NULL,
  event_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_events_event_id_idx ON platform_events (event_id);
CREATE INDEX IF NOT EXISTS platform_events_created_idx ON platform_events (created_at);
COMMIT;
