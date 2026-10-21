-- Preserve totals and historical stock valuation for old application versions.
BEGIN;
UPDATE stock_receipts SET extra_cost = extra_cost + shipping_cost + tax_amount;
ALTER TABLE stock_receipts DROP COLUMN shipping_cost, DROP COLUMN tax_amount;
COMMIT;
