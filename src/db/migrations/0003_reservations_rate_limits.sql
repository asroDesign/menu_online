CREATE TABLE reservations (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  table_id integer REFERENCES dining_tables(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  guest_count integer NOT NULL CHECK (guest_count BETWEEN 1 AND 30),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 30 AND 480),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed', 'no_show')),
  deposit_amount integer NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  deposit_status text NOT NULL DEFAULT 'not_required' CHECK (deposit_status IN ('not_required', 'pending', 'paid', 'waived')),
  deposit_method text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservations_business_start_idx ON reservations(business_id, starts_at);
CREATE INDEX reservations_table_start_idx ON reservations(table_id, starts_at);

CREATE TABLE api_rate_limits (
  key text PRIMARY KEY,
  window_started timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_rate_limits_updated_idx ON api_rate_limits(updated_at);
