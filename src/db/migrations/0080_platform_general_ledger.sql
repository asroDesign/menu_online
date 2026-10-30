BEGIN;

CREATE TABLE platform_accounts (
  code text PRIMARY KEY,
  name text NOT NULL,
  parent_code text REFERENCES platform_accounts(code),
  level text NOT NULL CHECK (level IN ('کل','معین','تفصیلی')),
  kind text NOT NULL CHECK (kind IN ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_journals (
  id serial PRIMARY KEY,
  document_no serial NOT NULL UNIQUE,
  date timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  source_type text NOT NULL CHECK (source_type IN ('subscription_invoice','subscription_receipt','platform_expense','affiliate_commission','affiliate_payout','manual')),
  source_id integer,
  reversal_of integer REFERENCES platform_journals(id),
  created_by text NOT NULL DEFAULT 'سیستم',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_journal_source_unique UNIQUE (source_type, source_id)
);
CREATE INDEX platform_journal_date_idx ON platform_journals(date);

CREATE TABLE platform_journal_lines (
  id serial PRIMARY KEY,
  journal_id integer NOT NULL REFERENCES platform_journals(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  account_code text NOT NULL REFERENCES platform_accounts(code),
  description text NOT NULL DEFAULT '',
  debit bigint NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit bigint NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CONSTRAINT platform_journal_line_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CONSTRAINT platform_journal_line_no_unique UNIQUE (journal_id, line_no)
);
CREATE INDEX platform_journal_account_idx ON platform_journal_lines(account_code, journal_id);

ALTER TABLE platform_expenses ADD COLUMN payment_method text NOT NULL DEFAULT 'transfer';
ALTER TABLE platform_expenses ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','void'));

INSERT INTO platform_accounts(code,name,parent_code,level,kind,normal_balance,is_system) VALUES
 ('1000','دارایی‌های جاری',NULL,'کل','asset','debit',true),
 ('1010','صندوق','1000','معین','asset','debit',true),
 ('10101','نقد سامانه','1010','تفصیلی','asset','debit',true),
 ('1020','بانک‌ها','1000','معین','asset','debit',true),
 ('10201','بانک / درگاه سامانه','1020','تفصیلی','asset','debit',true),
 ('1030','مطالبات اشتراک','1000','معین','asset','debit',true),
 ('10301','فاکتورهای دریافتنی','1030','تفصیلی','asset','debit',true),
 ('2000','بدهی‌های جاری',NULL,'کل','liability','credit',true),
 ('2010','بدهی به همکاران','2000','معین','liability','credit',true),
 ('20101','پورسانت پرداختنی','2010','تفصیلی','liability','credit',true),
 ('4000','درآمدها',NULL,'کل','revenue','credit',true),
 ('4010','درآمد اشتراک','4000','معین','revenue','credit',true),
 ('5000','هزینه‌ها',NULL,'کل','expense','debit',true),
 ('5010','هزینه زیرساخت','5000','معین','expense','debit',true),
 ('5020','هزینه پیامک و ارتباطات','5000','معین','expense','debit',true),
 ('5030','حقوق و دستمزد','5000','معین','expense','debit',true),
 ('5040','بازاریابی و تبلیغات','5000','معین','expense','debit',true),
 ('5050','ابزار و نرم‌افزار','5000','معین','expense','debit',true),
 ('5060','هزینه‌های متفرقه','5000','معین','expense','debit',true),
 ('5070','پورسانت فروش','5000','معین','expense','debit',true)
ON CONFLICT (code) DO NOTHING;

-- Existing invoices are accrued to receivables; paid invoices also clear that receivable to bank/cash.
INSERT INTO platform_journals(date,description,source_type,source_id,created_by)
SELECT created_at, 'صدور فاکتور اشتراک #' || number, 'subscription_invoice', id, coalesce(created_by,'سیستم')
FROM subscription_invoices WHERE status IN ('paid','unpaid') AND amount > 0
ON CONFLICT (source_type,source_id) DO NOTHING;
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,1,'10301','مطالبه فاکتور اشتراک',i.amount,0
FROM platform_journals j JOIN subscription_invoices i ON j.source_type='subscription_invoice' AND j.source_id=i.id
WHERE NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id);
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,2,'4010','درآمد اشتراک',0,i.amount
FROM platform_journals j JOIN subscription_invoices i ON j.source_type='subscription_invoice' AND j.source_id=i.id
WHERE NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id AND l.line_no=2);
INSERT INTO platform_journals(date,description,source_type,source_id,created_by)
SELECT paid_at, 'دریافت فاکتور اشتراک #' || number, 'subscription_receipt', id, coalesce(created_by,'سیستم')
FROM subscription_invoices WHERE status='paid' AND amount > 0 AND paid_at IS NOT NULL
ON CONFLICT (source_type,source_id) DO NOTHING;
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,1,CASE WHEN i.method='cash' THEN '10101' ELSE '10201' END,'دریافت فاکتور اشتراک',i.amount,0
FROM platform_journals j JOIN subscription_invoices i ON j.source_type='subscription_receipt' AND j.source_id=i.id
WHERE NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id);
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,2,'10301','تسویه فاکتور دریافتنی',0,i.amount
FROM platform_journals j JOIN subscription_invoices i ON j.source_type='subscription_receipt' AND j.source_id=i.id
WHERE NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id AND l.line_no=2);

INSERT INTO platform_journals(date,description,source_type,source_id,created_by)
SELECT date, 'هزینه سامانه · ' || category, 'platform_expense', id, coalesce(created_by,'سیستم')
FROM platform_expenses WHERE status='active' AND amount > 0 AND category NOT ILIKE '%پورسانت%'
ON CONFLICT (source_type,source_id) DO NOTHING;
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,1,CASE WHEN e.category ILIKE '%سرور%' OR e.category ILIKE '%زیرساخت%' OR e.category ILIKE '%دامنه%' THEN '5010'
 WHEN e.category ILIKE '%پیامک%' OR e.category ILIKE '%ارتباط%' THEN '5020'
 WHEN e.category ILIKE '%حقوق%' THEN '5030' WHEN e.category ILIKE '%بازاریابی%' OR e.category ILIKE '%تبلیغ%' THEN '5040'
 WHEN e.category ILIKE '%ابزار%' OR e.category ILIKE '%نرم افزار%' THEN '5050' WHEN e.category ILIKE '%پورسانت%' THEN '5070' ELSE '5060' END,
 e.category,e.amount,0 FROM platform_journals j JOIN platform_expenses e ON j.source_type='platform_expense' AND j.source_id=e.id
 WHERE e.category NOT ILIKE '%پورسانت%' AND NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id);
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,2,CASE WHEN e.payment_method='cash' THEN '10101' ELSE '10201' END,'پرداخت هزینه سامانه',0,e.amount
FROM platform_journals j JOIN platform_expenses e ON j.source_type='platform_expense' AND j.source_id=e.id
WHERE NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id AND l.line_no=2);

INSERT INTO platform_journals(date,description,source_type,source_id,created_by)
SELECT date,description,source_type,source_id,coalesce(created_by,'سیستم') FROM platform_accounting_documents
WHERE source_type IN ('affiliate_commission','affiliate_payout')
ON CONFLICT (source_type,source_id) DO NOTHING;
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,1,CASE WHEN j.source_type='affiliate_commission' THEN '5070' ELSE '20101' END,j.description,d.amount,0
FROM platform_journals j JOIN platform_accounting_documents d ON d.source_type=j.source_type AND d.source_id=j.source_id
WHERE j.source_type IN ('affiliate_commission','affiliate_payout') AND NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id);
INSERT INTO platform_journal_lines(journal_id,line_no,account_code,description,debit,credit)
SELECT j.id,2,CASE WHEN j.source_type='affiliate_commission' THEN '20101' ELSE '10201' END,j.description,0,d.amount
FROM platform_journals j JOIN platform_accounting_documents d ON d.source_type=j.source_type AND d.source_id=j.source_id
WHERE j.source_type IN ('affiliate_commission','affiliate_payout') AND NOT EXISTS (SELECT 1 FROM platform_journal_lines l WHERE l.journal_id=j.id AND l.line_no=2);

COMMIT;
