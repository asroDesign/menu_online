BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform_checks) OR EXISTS (SELECT 1 FROM platform_journals WHERE source_type IN ('platform_check','platform_check_settlement')) THEN
    RAISE EXCEPTION 'Refusing to drop platform cheque records or their accounting entries; export or migrate them first.';
  END IF;
  IF EXISTS (SELECT 1 FROM platform_journal_lines WHERE account_code IN ('10302','20201')) THEN
    RAISE EXCEPTION 'Refusing to drop cheque accounts referenced by journal lines.';
  END IF;
END $$;
DROP TABLE platform_checks;
DELETE FROM platform_accounts WHERE code IN ('10302','20201') AND is_system=true;
DELETE FROM platform_accounts WHERE code='2020' AND is_system=true AND NOT EXISTS (SELECT 1 FROM platform_accounts c WHERE c.parent_code='2020');
ALTER TABLE platform_journals DROP CONSTRAINT IF EXISTS platform_journals_source_type_check;
ALTER TABLE platform_journals ADD CONSTRAINT platform_journals_source_type_check CHECK (
  source_type IN ('subscription_invoice','subscription_receipt','platform_expense','affiliate_commission','affiliate_payout','manual')
);
COMMIT;
