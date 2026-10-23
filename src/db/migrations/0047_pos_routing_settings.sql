BEGIN;

ALTER TABLE devices
  ADD COLUMN settlement_bank_account_id integer REFERENCES bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN cashier_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN kiosk_enabled boolean NOT NULL DEFAULT false;

COMMIT;
