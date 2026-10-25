BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cheque_beneficiaries) OR EXISTS (SELECT 1 FROM cheque_reminders) THEN
    RAISE EXCEPTION 'Refusing to drop cheque beneficiary or reminder data; export or migrate it first.';
  END IF;
END $$;

DROP TABLE cheque_reminders;
DROP INDEX IF EXISTS cheques_business_serial_number_idx;
ALTER TABLE cheques
  DROP COLUMN beneficiary_id,
  DROP COLUMN issue_date,
  DROP COLUMN cheque_number,
  DROP COLUMN serial_number,
  DROP COLUMN branch,
  DROP COLUMN expense_purpose;
DROP TABLE cheque_beneficiaries;

COMMIT;
