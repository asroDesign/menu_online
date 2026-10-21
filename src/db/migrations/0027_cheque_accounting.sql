BEGIN;

ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS accounting_account_id integer REFERENCES acc_accounts(id),
  ADD COLUMN IF NOT EXISTS accounting_document_id integer REFERENCES acc_documents(id);

ALTER TABLE cheque_events
  ADD COLUMN IF NOT EXISTS accounting_account_id integer REFERENCES acc_accounts(id),
  ADD COLUMN IF NOT EXISTS reversal_document_id integer REFERENCES acc_documents(id),
  ADD COLUMN IF NOT EXISTS accounting_document_id integer REFERENCES acc_documents(id);

-- Keep historical records while translating the old workflow into the new statuses.
ALTER TABLE cheques DROP CONSTRAINT IF EXISTS cheques_status_check;
UPDATE cheques SET status = CASE status
  WHEN 'issued' THEN 'registered'
  WHEN 'received' THEN 'registered'
  WHEN 'presented' THEN 'registered'
  WHEN 'cleared' THEN 'passed'
  WHEN 'returned' THEN 'bounced'
  WHEN 'canceled' THEN 'voided'
  ELSE status
END;

UPDATE cheque_events SET
  from_status = CASE from_status
    WHEN 'issued' THEN 'registered'
    WHEN 'received' THEN 'registered'
    WHEN 'presented' THEN 'registered'
    WHEN 'cleared' THEN 'passed'
    WHEN 'returned' THEN 'bounced'
    WHEN 'canceled' THEN 'voided'
    ELSE from_status
  END,
  to_status = CASE to_status
    WHEN 'issued' THEN 'registered'
    WHEN 'received' THEN 'registered'
    WHEN 'presented' THEN 'registered'
    WHEN 'cleared' THEN 'passed'
    WHEN 'returned' THEN 'bounced'
    WHEN 'canceled' THEN 'voided'
    ELSE to_status
  END;

ALTER TABLE cheques ADD CONSTRAINT cheques_status_check
  CHECK (status IN ('registered', 'passed', 'bounced', 'returned', 'assigned', 'voided'));

COMMIT;
