-- Dropping the table discards aggregated raw event history.
BEGIN;
DROP TABLE IF EXISTS menu_events;
COMMIT;
