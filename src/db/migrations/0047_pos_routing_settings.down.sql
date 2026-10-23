BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM devices
    WHERE settlement_bank_account_id IS NOT NULL OR cashier_enabled OR kiosk_enabled
  ) THEN
    RAISE EXCEPTION 'Cannot roll back POS routing while a terminal is linked to an account or channel';
  END IF;
END $$;

ALTER TABLE devices
  DROP COLUMN kiosk_enabled,
  DROP COLUMN cashier_enabled,
  DROP COLUMN settlement_bank_account_id;

COMMIT;
