BEGIN;

CREATE TABLE IF NOT EXISTS staff_shift_templates (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  weekdays text NOT NULL CHECK (weekdays ~ '^[0-6](,[0-6])*$'),
  start_time text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_shift_templates_business_idx ON staff_shift_templates (business_id, staff_id);

ALTER TABLE staff_schedules ADD COLUMN IF NOT EXISTS template_id integer REFERENCES staff_shift_templates(id) ON DELETE SET NULL;
ALTER TABLE staff_schedules ADD COLUMN IF NOT EXISTS absence_note text NOT NULL DEFAULT '';
ALTER TABLE staff_schedules ADD COLUMN IF NOT EXISTS absence_recorded_by integer REFERENCES users(id);
ALTER TABLE staff_schedules ADD COLUMN IF NOT EXISTS absence_recorded_at timestamptz;
ALTER TABLE staff_schedules DROP CONSTRAINT IF EXISTS staff_schedules_status_check;
ALTER TABLE staff_schedules ADD CONSTRAINT staff_schedules_status_check CHECK (status IN ('scheduled', 'canceled', 'absent'));
CREATE UNIQUE INDEX IF NOT EXISTS staff_schedules_template_instance_idx
  ON staff_schedules (template_id, staff_id, starts_at, ends_at) WHERE template_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_shift_swap_requests (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  schedule_id integer NOT NULL REFERENCES staff_schedules(id) ON DELETE CASCADE,
  from_staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  to_staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  requested_by integer NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending_target' CHECK (status IN ('pending_target', 'pending_manager', 'approved', 'rejected')),
  reason text NOT NULL DEFAULT '',
  decision_note text NOT NULL DEFAULT '',
  decided_by integer REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_staff_id <> to_staff_id)
);
CREATE INDEX IF NOT EXISTS staff_shift_swaps_business_status_idx ON staff_shift_swap_requests (business_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS staff_shift_swaps_one_pending_per_schedule_idx
  ON staff_shift_swap_requests (schedule_id) WHERE status IN ('pending_target', 'pending_manager');

COMMIT;
