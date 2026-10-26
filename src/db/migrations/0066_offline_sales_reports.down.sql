BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_snapshots WHERE dataset = 'reports') THEN
    RAISE EXCEPTION 'Refusing to remove offline sales-report support while report snapshots exist';
  END IF;
END $$;

ALTER TABLE offline_workspace_snapshots DROP CONSTRAINT IF EXISTS offline_workspace_snapshots_dataset_check;
ALTER TABLE offline_workspace_snapshots
  ADD CONSTRAINT offline_workspace_snapshots_dataset_check
  CHECK (dataset IN ('menu','customers','inventory','orders','reservations','shifts','accounting','receivables','cash_shifts'));

COMMIT;
