-- Dropping this table discards aggregate platform funnel history.
BEGIN;
DROP TABLE IF EXISTS platform_events;
COMMIT;
