CREATE TABLE IF NOT EXISTS affiliates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  referral_code text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  introduction text NOT NULL DEFAULT '',
  commission_percent integer NOT NULL DEFAULT 10,
  attribution_days integer NOT NULL DEFAULT 30,
  minimum_withdrawal bigint NOT NULL DEFAULT 0,
  bank_name text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  card_number text NOT NULL DEFAULT '',
  sheba text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE TABLE IF NOT EXISTS affiliate_sessions (
  id text PRIMARY KEY,
  affiliate_id integer NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS affiliate_id integer REFERENCES affiliates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS businesses_affiliate_idx ON businesses(affiliate_id);

CREATE TABLE IF NOT EXISTS blog_posts (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'عمومی',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_image text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT 'تیم منوی دیجیتال',
  status text NOT NULL DEFAULT 'draft',
  meta_title text NOT NULL DEFAULT '',
  meta_description text NOT NULL DEFAULT '',
  canonical_url text NOT NULL DEFAULT '',
  no_index boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx ON blog_posts(status, published_at);

CREATE TABLE IF NOT EXISTS tutorials (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'راهنمای شروع',
  cover_image text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  meta_title text NOT NULL DEFAULT '',
  meta_description text NOT NULL DEFAULT '',
  no_index boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tutorials_status_order_idx ON tutorials(status, sort_order);

CREATE TABLE IF NOT EXISTS faqs (
  id serial PRIMARY KEY,
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'عمومی',
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testimonials (
  id serial PRIMARY KEY,
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  image_url text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_requests (
  id serial PRIMARY KEY,
  kind text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  preferred_at timestamptz,
  status text NOT NULL DEFAULT 'new',
  assigned_to integer,
  source text NOT NULL DEFAULT 'website',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_requests_status_created_idx ON lead_requests(status, created_at);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id serial PRIMARY KEY,
  affiliate_id integer NOT NULL REFERENCES affiliates(id),
  business_id integer NOT NULL REFERENCES businesses(id),
  invoice_id integer NOT NULL UNIQUE REFERENCES subscription_invoices(id),
  sale_amount bigint NOT NULL,
  commission_percent integer NOT NULL,
  amount bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_idx ON affiliate_commissions(affiliate_id, created_at);
CREATE TABLE IF NOT EXISTS affiliate_wallet_entries (
  id serial PRIMARY KEY,
  affiliate_id integer NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount bigint NOT NULL,
  reference_type text NOT NULL,
  reference_id integer NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(affiliate_id, kind, reference_type, reference_id)
);
CREATE INDEX IF NOT EXISTS affiliate_wallet_date_idx ON affiliate_wallet_entries(affiliate_id, created_at);
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
  id serial PRIMARY KEY,
  affiliate_id integer NOT NULL REFERENCES affiliates(id),
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bank_name text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  card_number text NOT NULL DEFAULT '',
  sheba text NOT NULL DEFAULT '',
  payout_reference text NOT NULL DEFAULT '',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS affiliate_withdrawals_affiliate_idx ON affiliate_withdrawals(affiliate_id, created_at);
CREATE INDEX IF NOT EXISTS affiliate_withdrawals_status_idx ON affiliate_withdrawals(status, created_at);
CREATE TABLE IF NOT EXISTS platform_accounting_documents (
  id serial PRIMARY KEY,
  source_type text NOT NULL,
  source_id integer NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  amount bigint NOT NULL,
  created_by text NOT NULL DEFAULT 'سیستم',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);
CREATE INDEX IF NOT EXISTS platform_accounting_date_idx ON platform_accounting_documents(date);
