BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE membership_snapshot IS NOT NULL OR membership_discount > 0) THEN
    RAISE EXCEPTION 'Refusing to drop membership discount snapshots; export or archive orders before rollback';
  END IF;
END $$;
ALTER TABLE orders DROP COLUMN membership_applied_by, DROP COLUMN membership_snapshot, DROP COLUMN membership_discount;
COMMIT;
