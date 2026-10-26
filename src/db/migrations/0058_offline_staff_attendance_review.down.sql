BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_staff_attendance_requests) THEN
    RAISE EXCEPTION 'Refusing to drop offline_staff_attendance_requests while attendance review history exists';
  END IF;
END $$;
DROP TABLE offline_staff_attendance_requests;
COMMIT;
