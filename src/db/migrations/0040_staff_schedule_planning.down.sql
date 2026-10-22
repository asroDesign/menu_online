BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM staff_shift_swap_requests)
     OR EXISTS (SELECT 1 FROM staff_shift_templates)
     OR EXISTS (SELECT 1 FROM staff_schedules WHERE template_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM staff_schedules WHERE status = 'absent') THEN
    RAISE EXCEPTION 'Cannot roll back staff schedule planning while templates, swaps, generated shifts, or absence records exist; export or resolve this data first.';
  END IF;
END $$;

DROP TABLE staff_shift_swap_requests;
DROP INDEX IF EXISTS staff_schedules_template_instance_idx;
ALTER TABLE staff_schedules DROP COLUMN template_id;
ALTER TABLE staff_schedules DROP COLUMN absence_note;
ALTER TABLE staff_schedules DROP COLUMN absence_recorded_by;
ALTER TABLE staff_schedules DROP COLUMN absence_recorded_at;
ALTER TABLE staff_schedules DROP CONSTRAINT IF EXISTS staff_schedules_status_check;
ALTER TABLE staff_schedules ADD CONSTRAINT staff_schedules_status_check CHECK (status IN ('scheduled', 'canceled'));
DROP TABLE staff_shift_templates;

COMMIT;
