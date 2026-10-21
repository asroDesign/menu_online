-- Keep the timestamp column on rollback: dropping it would discard update history,
-- and older application versions safely ignore this extra column.
BEGIN;
COMMIT;
