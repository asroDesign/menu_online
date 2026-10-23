BEGIN;

CREATE TABLE IF NOT EXISTS waiter_service_requests (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_id integer NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'call' CHECK (kind IN ('call', 'message')),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((kind = 'call' AND message = '') OR (kind = 'message' AND length(trim(message)) > 0))
);

CREATE INDEX IF NOT EXISTS waiter_service_requests_business_status_idx
  ON waiter_service_requests (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS waiter_service_requests_table_time_idx
  ON waiter_service_requests (table_id, created_at DESC);

COMMIT;
