BEGIN;

CREATE TABLE IF NOT EXISTS staff_attendance_records (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  schedule_id integer NOT NULL UNIQUE REFERENCES staff_schedules(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_by integer REFERENCES users(id),
  check_out_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_in_at IS NULL OR check_out_at IS NULL OR check_out_at >= check_in_at)
);
CREATE INDEX IF NOT EXISTS staff_attendance_business_time_idx ON staff_attendance_records (business_id, check_in_at);
CREATE INDEX IF NOT EXISTS staff_attendance_staff_time_idx ON staff_attendance_records (staff_id, check_in_at);

CREATE TABLE IF NOT EXISTS staff_attendance_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  record_id integer NOT NULL REFERENCES staff_attendance_records(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('check_in', 'check_out', 'adjust_check_in', 'adjust_check_out')),
  previous_at timestamptz,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  recorded_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_attendance_events_record_idx ON staff_attendance_events (record_id, created_at);

COMMIT;
