BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM dining_tables WHERE operational_status <> 'available') OR EXISTS (SELECT 1 FROM table_status_events) THEN
    RAISE EXCEPTION 'Refusing to discard operational table states or their audit history.';
  END IF;
END $$;

DROP TABLE table_status_events;
ALTER TABLE dining_tables DROP CONSTRAINT dining_tables_operational_status_check;
ALTER TABLE dining_tables DROP COLUMN operational_status;

COMMIT;
