BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM staff_attendance_records) THEN
    RAISE EXCEPTION 'Cannot roll back staff attendance while attendance records or audit events exist; export or resolve this data first.';
  END IF;
END $$;

DROP TABLE staff_attendance_events;
DROP TABLE staff_attendance_records;

COMMIT;
