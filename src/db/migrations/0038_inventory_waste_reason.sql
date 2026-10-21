ALTER TABLE stock_receipts
  ADD COLUMN waste_reason text NOT NULL DEFAULT ''
    CHECK (waste_reason IN ('', 'spoilage', 'expired', 'prep_loss', 'quality', 'damaged', 'other'));
