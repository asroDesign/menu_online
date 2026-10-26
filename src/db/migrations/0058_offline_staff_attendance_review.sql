BEGIN;

CREATE TABLE IF NOT EXISTS offline_staff_attendance_requests (
  id text PRIMARY KEY,
  terminal_id text NOT NULL REFERENCES offline_terminals(id) ON DELETE RESTRICT,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  schedule_id integer NOT NULL REFERENCES staff_schedules(id) ON DELETE RESTRICT,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  schedule_version integer NOT NULL CHECK (schedule_version > 0),
  action text NOT NULL CHECK (action IN ('check_in','check_out')),
  occurred_at timestamptz NOT NULL,
  expected_check_in_at timestamptz,
  previous_request_id text REFERENCES offline_staff_attendance_requests(id) ON DELETE RESTRICT,
  snapshot_id text NOT NULL,
  snapshot_revision integer NOT NULL CHECK (snapshot_revision > 0),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','conflict')),
  reviewed_by integer REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_staff_attendance_terminal_business_fk
    FOREIGN KEY (terminal_id, business_id)
    REFERENCES offline_terminals(id, business_id) ON DELETE RESTRICT,
  CONSTRAINT offline_staff_attendance_previous_action_check
    CHECK ((action = 'check_in' AND expected_check_in_at IS NULL AND previous_request_id IS NULL)
      OR (action = 'check_out' AND expected_check_in_at IS NOT NULL))
);

CREATE UNIQUE INDEX offline_staff_attendance_pending_action_uq
  ON offline_staff_attendance_requests(business_id, schedule_id, action)
  WHERE status = 'pending';
CREATE INDEX offline_staff_attendance_review_idx
  ON offline_staff_attendance_requests(business_id, status, created_at DESC);

COMMIT;
