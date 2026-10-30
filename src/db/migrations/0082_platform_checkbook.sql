BEGIN;

ALTER TABLE platform_journals DROP CONSTRAINT IF EXISTS platform_journals_source_type_check;
ALTER TABLE platform_journals ADD CONSTRAINT platform_journals_source_type_check CHECK (
  source_type IN ('subscription_invoice','subscription_receipt','platform_expense','affiliate_commission','affiliate_payout','platform_check','platform_check_settlement','manual')
);

INSERT INTO platform_accounts(code,name,parent_code,level,kind,normal_balance,is_system) VALUES
 ('10302','اسناد دریافتنی','1030','تفصیلی','asset','debit',true),
 ('2020','سایر پرداختنی‌ها','2000','معین','liability','credit',true),
 ('20201','اسناد پرداختنی','2020','تفصیلی','liability','credit',true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE platform_checks (
  id serial PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('received','issued')),
  check_number text NOT NULL,
  serial_number text NOT NULL DEFAULT '',
  bank_name text NOT NULL,
  branch text NOT NULL DEFAULT '',
  party_name text NOT NULL,
  party_phone text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  issue_date timestamptz NOT NULL,
  due_date timestamptz NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  bank_account_code text NOT NULL REFERENCES platform_accounts(code),
  counter_account_code text NOT NULL REFERENCES platform_accounts(code),
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','cleared','returned','void')),
  journal_id integer REFERENCES platform_journals(id),
  settlement_journal_id integer REFERENCES platform_journals(id),
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_check_dates_valid CHECK (due_date >= issue_date)
);
CREATE INDEX platform_checks_due_idx ON platform_checks(status,due_date);
CREATE INDEX platform_checks_number_idx ON platform_checks(direction,check_number);

COMMIT;
