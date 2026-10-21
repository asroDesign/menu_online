BEGIN;
CREATE TABLE IF NOT EXISTS staff_schedules (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by integer NOT NULL REFERENCES users(id),
  updated_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS staff_schedules_business_time_idx ON staff_schedules (business_id, starts_at);
CREATE INDEX IF NOT EXISTS staff_schedules_staff_time_idx ON staff_schedules (staff_id, starts_at);

CREATE TABLE IF NOT EXISTS staff_leave_requests (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'sick', 'unpaid')),
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by integer REFERENCES users(id),
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS staff_leave_business_time_idx ON staff_leave_requests (business_id, starts_at);
CREATE INDEX IF NOT EXISTS staff_leave_staff_time_idx ON staff_leave_requests (staff_id, starts_at);
COMMIT;
