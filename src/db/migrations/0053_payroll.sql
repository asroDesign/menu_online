BEGIN;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS national_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS father_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS marital_status text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS employment_start_date date,
  ADD COLUMN IF NOT EXISTS employment_end_date date,
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT 'temporary',
  ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS job_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS insurance_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS insured_history_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS children_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS child_allowance_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS salary_mode text NOT NULL DEFAULT 'statutory',
  ADD COLUMN IF NOT EXISTS monthly_base_salary_toman bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_agreed_salary_toman bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_allowance_toman bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_service_base_toman bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS insurance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS income_tax_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_housing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_food boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_marital_allowance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_child_allowance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_seniority boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_account_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS iban text NOT NULL DEFAULT '';

ALTER TABLE staff
  ADD CONSTRAINT staff_payroll_values_nonnegative CHECK (
    insured_history_days >= 0 AND children_count >= 0 AND monthly_base_salary_toman >= 0 AND
    fixed_agreed_salary_toman >= 0 AND management_allowance_toman >= 0 AND annual_service_base_toman >= 0
  ),
  ADD CONSTRAINT staff_salary_mode_valid CHECK (salary_mode IN ('statutory', 'fixed')),
  ADD CONSTRAINT staff_marital_status_valid CHECK (marital_status IN ('single', 'married', 'unknown'));

CREATE TABLE IF NOT EXISTS payroll_policies (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  jalali_year integer NOT NULL CHECK (jalali_year BETWEEN 1380 AND 1500),
  minimum_daily_wage_toman bigint NOT NULL DEFAULT 0 CHECK (minimum_daily_wage_toman >= 0),
  monthly_housing_toman bigint NOT NULL DEFAULT 0 CHECK (monthly_housing_toman >= 0),
  monthly_food_toman bigint NOT NULL DEFAULT 0 CHECK (monthly_food_toman >= 0),
  monthly_marital_toman bigint NOT NULL DEFAULT 0 CHECK (monthly_marital_toman >= 0),
  monthly_child_toman bigint NOT NULL DEFAULT 0 CHECK (monthly_child_toman >= 0),
  monthly_seniority_toman bigint NOT NULL DEFAULT 0 CHECK (monthly_seniority_toman >= 0),
  monthly_tax_exemption_toman bigint NOT NULL DEFAULT 0 CHECK (monthly_tax_exemption_toman >= 0),
  tax_brackets jsonb NOT NULL DEFAULT '[]'::jsonb,
  taxable_component_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  insurable_component_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  employee_insurance_percent integer NOT NULL DEFAULT 7 CHECK (employee_insurance_percent BETWEEN 0 AND 100),
  employer_insurance_percent integer NOT NULL DEFAULT 20 CHECK (employer_insurance_percent BETWEEN 0 AND 100),
  unemployment_insurance_percent integer NOT NULL DEFAULT 3 CHECK (unemployment_insurance_percent BETWEEN 0 AND 100),
  overtime_percent integer NOT NULL DEFAULT 40 CHECK (overtime_percent BETWEEN 0 AND 300),
  friday_premium_percent integer NOT NULL DEFAULT 40 CHECK (friday_premium_percent BETWEEN 0 AND 300),
  holiday_premium_percent integer NOT NULL DEFAULT 0 CHECK (holiday_premium_percent BETWEEN 0 AND 300),
  night_premium_percent integer NOT NULL DEFAULT 35 CHECK (night_premium_percent BETWEEN 0 AND 300),
  standard_monthly_hours integer NOT NULL DEFAULT 220 CHECK (standard_monthly_hours BETWEEN 1 AND 400),
  minimum_insured_history_days_for_child_allowance integer NOT NULL DEFAULT 720 CHECK (minimum_insured_history_days_for_child_allowance >= 0),
  annual_leave_days integer NOT NULL DEFAULT 26 CHECK (annual_leave_days BETWEEN 0 AND 100),
  legal_source_note text NOT NULL DEFAULT '',
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_policies_business_year_uq UNIQUE (business_id, jalali_year)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  jalali_year integer NOT NULL CHECK (jalali_year BETWEEN 1380 AND 1500),
  jalali_month integer NOT NULL CHECK (jalali_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  salary_document_id integer REFERENCES acc_documents(id) ON DELETE RESTRICT,
  created_by integer NOT NULL REFERENCES users(id),
  approved_by integer REFERENCES users(id),
  approved_at timestamptz,
  approval_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_business_period_uq UNIQUE (business_id, jalali_year, jalali_month)
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_id integer NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  staff_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  work_minutes integer NOT NULL DEFAULT 0 CHECK (work_minutes >= 0),
  overtime_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  friday_minutes integer NOT NULL DEFAULT 0 CHECK (friday_minutes >= 0),
  holiday_minutes integer NOT NULL DEFAULT 0 CHECK (holiday_minutes >= 0),
  night_minutes integer NOT NULL DEFAULT 0 CHECK (night_minutes >= 0),
  leave_minutes integer NOT NULL DEFAULT 0 CHECK (leave_minutes >= 0),
  unpaid_leave_minutes integer NOT NULL DEFAULT 0 CHECK (unpaid_leave_minutes >= 0),
  short_minutes integer NOT NULL DEFAULT 0 CHECK (short_minutes >= 0),
  earnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross_toman bigint NOT NULL DEFAULT 0 CHECK (gross_toman >= 0),
  employee_insurance_toman bigint NOT NULL DEFAULT 0 CHECK (employee_insurance_toman >= 0),
  employer_insurance_toman bigint NOT NULL DEFAULT 0 CHECK (employer_insurance_toman >= 0),
  income_tax_toman bigint NOT NULL DEFAULT 0 CHECK (income_tax_toman >= 0),
  penalty_toman bigint NOT NULL DEFAULT 0 CHECK (penalty_toman >= 0),
  net_toman bigint NOT NULL DEFAULT 0 CHECK (net_toman >= 0),
  approved_taxable_adjustments_toman bigint NOT NULL DEFAULT 0 CHECK (approved_taxable_adjustments_toman >= 0),
  approved_insurable_adjustments_toman bigint NOT NULL DEFAULT 0 CHECK (approved_insurable_adjustments_toman >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_items_run_staff_uq UNIQUE (run_id, staff_id)
);
CREATE INDEX IF NOT EXISTS payroll_items_business_staff_idx ON payroll_items (business_id, staff_id);

CREATE TABLE IF NOT EXISTS payroll_item_events (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_id integer NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  item_id integer NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  action text NOT NULL,
  before_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  actor_id integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_item_events_item_time_idx ON payroll_item_events (business_id, item_id, created_at);

CREATE TABLE IF NOT EXISTS staff_payroll_adjustments (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  jalali_year integer NOT NULL,
  jalali_month integer NOT NULL CHECK (jalali_month BETWEEN 1 AND 12),
  kind text NOT NULL CHECK (kind IN ('reward', 'penalty')),
  amount_toman bigint NOT NULL CHECK (amount_toman > 0),
  description text NOT NULL,
  legal_basis text NOT NULL DEFAULT '',
  taxable boolean NOT NULL DEFAULT true,
  insurable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by integer NOT NULL REFERENCES users(id),
  approved_by integer REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_payroll_adjustments_period_idx ON staff_payroll_adjustments (business_id, jalali_year, jalali_month, staff_id);

CREATE TABLE IF NOT EXISTS staff_payroll_leaves (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  jalali_year integer NOT NULL,
  jalali_month integer NOT NULL CHECK (jalali_month BETWEEN 1 AND 12),
  kind text NOT NULL CHECK (kind IN ('annual', 'sick', 'unpaid', 'other')),
  hours double precision NOT NULL CHECK (hours > 0 AND hours <= 744),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by integer NOT NULL REFERENCES users(id),
  decided_by integer REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_payroll_leaves_period_idx ON staff_payroll_leaves (business_id, jalali_year, jalali_month, staff_id);

CREATE TABLE IF NOT EXISTS payroll_settlements (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_id integer NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('salary', 'insurance', 'tax')),
  amount_toman bigint NOT NULL CHECK (amount_toman > 0),
  bank_account_id integer REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  accounting_document_id integer REFERENCES acc_documents(id) ON DELETE RESTRICT,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by integer NOT NULL REFERENCES users(id),
  CONSTRAINT payroll_settlements_run_kind_uq UNIQUE (run_id, kind)
);

COMMIT;
