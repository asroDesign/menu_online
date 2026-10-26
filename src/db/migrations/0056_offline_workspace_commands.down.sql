-- Applied commands are an audit/idempotency ledger; never discard them implicitly.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_commands) THEN
    RAISE EXCEPTION 'Refusing to drop offline workspace command receipts; export/reconcile them first.';
  END IF;
END $$;
DROP TABLE IF EXISTS offline_workspace_commands;
DROP INDEX IF EXISTS offline_terminals_id_business_uq;
COMMIT;
