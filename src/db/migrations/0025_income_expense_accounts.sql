ALTER TABLE transactions
  ADD COLUMN account_moein_id integer,
  ADD COLUMN account_tafsili_id integer;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_account_moein_fk
    FOREIGN KEY (account_moein_id) REFERENCES acc_accounts(id) ON DELETE SET NULL,
  ADD CONSTRAINT transactions_account_tafsili_fk
    FOREIGN KEY (account_tafsili_id) REFERENCES acc_accounts(id) ON DELETE SET NULL;
