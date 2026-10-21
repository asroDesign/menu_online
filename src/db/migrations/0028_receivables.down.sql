BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM receivable_payment_reversals) OR EXISTS (SELECT 1 FROM receivable_payments) OR EXISTS (SELECT 1 FROM receivables) OR EXISTS (SELECT 1 FROM receivable_accounts) THEN
    RAISE EXCEPTION 'Refusing to drop non-empty receivables tables; export or migrate the ledger first.';
  END IF;
END $$;

DROP TABLE receivable_events;
DROP TABLE receivable_payment_reversals;
DROP TABLE receivable_payments;
DROP TABLE receivables;
DROP TABLE receivable_accounts;
DROP INDEX transactions_biz_source_ref_uq;
ALTER TABLE transactions DROP COLUMN source_ref, DROP COLUMN settlement_method;

COMMIT;
