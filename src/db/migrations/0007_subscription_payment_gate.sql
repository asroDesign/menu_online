-- A signup without a settled subscription invoice must not inherit the paid Basic plan.
ALTER TABLE businesses ALTER COLUMN plan SET DEFAULT 'pending';

-- OTP-created accounts use a synthetic email address. Move accounts created by the
-- previous signup flow to the checkout gate unless a paid subscription is recorded.
UPDATE businesses b
SET plan = 'pending'
FROM users u
WHERE b.user_id = u.id
  AND u.role = 'owner'
  AND u.email LIKE 'phone+%@phone.menupeak.ir'
  AND b.plan IN ('basic', 'premium', 'premium_plus')
  AND b.subscription_ends_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM subscription_invoices i
    WHERE i.business_id = b.id
      AND i.status = 'paid'
  );
