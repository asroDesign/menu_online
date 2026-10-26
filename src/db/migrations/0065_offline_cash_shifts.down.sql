BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_snapshots WHERE dataset = 'cash_shifts') THEN
    RAISE EXCEPTION 'Refusing to remove offline cash-shift support while cached snapshots exist';
  END IF;
END $$;

ALTER TABLE offline_workspace_snapshots DROP CONSTRAINT IF EXISTS offline_workspace_snapshots_dataset_check;
ALTER TABLE offline_workspace_snapshots
  ADD CONSTRAINT offline_workspace_snapshots_dataset_check
  CHECK (dataset IN ('menu','customers','inventory','orders','reservations','shifts','accounting','receivables'));

COMMIT;
