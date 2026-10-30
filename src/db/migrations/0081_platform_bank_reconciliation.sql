BEGIN;

CREATE TABLE platform_bank_statement_entries (
  id serial PRIMARY KEY,
  account_code text NOT NULL REFERENCES platform_accounts(code),
  transaction_date timestamptz NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  amount bigint NOT NULL CHECK (amount <> 0),
  fingerprint text NOT NULL UNIQUE,
  matched_journal_line_id integer UNIQUE REFERENCES platform_journal_lines(id),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_bank_statement_account_date_idx ON platform_bank_statement_entries(account_code, transaction_date);

COMMIT;
