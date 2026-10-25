BEGIN;

CREATE TABLE IF NOT EXISTS cheque_beneficiaries (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  national_id text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cheque_beneficiaries_business_name_idx
  ON cheque_beneficiaries (business_id, full_name);
CREATE UNIQUE INDEX IF NOT EXISTS cheque_beneficiaries_business_national_id_idx
  ON cheque_beneficiaries (business_id, national_id) WHERE national_id <> '';

ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS beneficiary_id integer REFERENCES cheque_beneficiaries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cheque_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS serial_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expense_purpose text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS cheques_business_serial_number_idx
  ON cheques (business_id, serial_number, cheque_number)
  WHERE serial_number <> '' AND cheque_number <> '';

CREATE TABLE IF NOT EXISTS cheque_reminders (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cheque_id integer NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  lead_days integer NOT NULL CHECK (lead_days BETWEEN 0 AND 30),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'sent', 'failed')),
  phone text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cheque_reminders_once_idx
  ON cheque_reminders (business_id, cheque_id, reminder_date);
CREATE INDEX IF NOT EXISTS cheque_reminders_status_idx
  ON cheque_reminders (business_id, status, reminder_date);

COMMIT;
