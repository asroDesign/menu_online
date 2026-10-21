ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_account_tafsili_fk,
  DROP CONSTRAINT IF EXISTS transactions_account_moein_fk,
  DROP COLUMN IF EXISTS account_tafsili_id,
  DROP COLUMN IF EXISTS account_moein_id;
