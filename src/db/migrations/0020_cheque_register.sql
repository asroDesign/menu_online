BEGIN;
CREATE TABLE IF NOT EXISTS cheques (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('payable', 'receivable')),
  status text NOT NULL CHECK (status IN ('issued', 'received', 'presented', 'cleared', 'returned', 'canceled')),
  partner_name text NOT NULL DEFAULT '',
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 2000000000000),
  due_date timestamptz NOT NULL,
  bank text NOT NULL DEFAULT '',
  sayad_identifier text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cheques_business_due_idx ON cheques (business_id, due_date);
CREATE INDEX IF NOT EXISTS cheques_business_status_idx ON cheques (business_id, status);
CREATE TABLE IF NOT EXISTS cheque_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cheque_id integer NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_id integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, request_key)
);
CREATE INDEX IF NOT EXISTS cheque_events_cheque_time_idx ON cheque_events (cheque_id, created_at);
COMMIT;
