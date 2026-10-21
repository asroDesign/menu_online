-- Intentionally preserve normalized cheque statuses and all accounting references.
-- Translating passed/bounced/assigned back to the legacy statuses would lose meaning,
-- and dropping these links would sever the financial audit trail.
BEGIN;
COMMIT;
