BEGIN;

ALTER TABLE dining_tables ADD COLUMN operational_status text NOT NULL DEFAULT 'available';
ALTER TABLE dining_tables ADD CONSTRAINT dining_tables_operational_status_check
  CHECK (operational_status IN ('available', 'cleaning', 'out_of_service'));

CREATE TABLE table_status_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_id integer REFERENCES dining_tables(id) ON DELETE SET NULL,
  table_name text NOT NULL DEFAULT '',
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text NOT NULL DEFAULT '',
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_status IN ('available', 'cleaning', 'out_of_service')),
  CHECK (to_status IN ('available', 'cleaning', 'out_of_service'))
);
CREATE INDEX table_status_events_business_table_time_idx ON table_status_events (business_id, table_id, created_at);

COMMIT;
