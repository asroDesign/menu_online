BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM waiter_service_requests) THEN
    RAISE EXCEPTION 'Cannot roll back waiter service requests while requests exist; export or resolve this data first.';
  END IF;
END $$;

DROP TABLE waiter_service_requests;

COMMIT;
