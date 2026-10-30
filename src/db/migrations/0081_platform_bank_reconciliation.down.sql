DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform_bank_statement_entries) THEN
    RAISE EXCEPTION 'Refusing to drop imported bank statement data; export it before rollback.';
  END IF;
END $$;
DROP TABLE platform_bank_statement_entries;
