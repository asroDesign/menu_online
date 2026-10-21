-- Rollback policy: preserve imported catalog identifiers and job audit records.
-- Revert application code first; drop this schema only after an explicit data export and owner approval.
BEGIN;
COMMIT;
