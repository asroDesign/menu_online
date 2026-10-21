-- Existing combined freight/extra_cost values remain unchanged.
ALTER TABLE stock_receipts
  ADD COLUMN shipping_cost bigint NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  ADD COLUMN tax_amount bigint NOT NULL DEFAULT 0 CHECK (tax_amount >= 0);
