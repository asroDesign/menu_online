DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform_journals) THEN
    RAISE EXCEPTION 'Refusing to drop platform accounting history; export or migrate the ledger first.';
  END IF;
END $$;
DROP TABLE platform_journal_lines;
DROP TABLE platform_journals;
DROP TABLE platform_accounts;
ALTER TABLE platform_expenses DROP COLUMN payment_method;
ALTER TABLE platform_expenses DROP COLUMN status;
