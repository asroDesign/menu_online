BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_snapshots WHERE dataset = 'accounting') THEN
    RAISE EXCEPTION 'Refusing to remove offline accounting snapshots while cached data exists';
  END IF;
  IF EXISTS (SELECT 1 FROM offline_workspace_commands WHERE module = 'accounting') THEN
    RAISE EXCEPTION 'Refusing to remove offline accounting commands while command history exists';
  END IF;
END $$;
ALTER TABLE offline_workspace_snapshots DROP CONSTRAINT IF EXISTS offline_workspace_snapshots_dataset_check;
ALTER TABLE offline_workspace_snapshots
  ADD CONSTRAINT offline_workspace_snapshots_dataset_check
  CHECK (dataset IN ('menu','customers','inventory','orders','reservations','shifts'));
ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_module_check;
ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_action_check;
ALTER TABLE offline_workspace_commands
  ADD CONSTRAINT offline_workspace_commands_module_check CHECK (module IN ('menu','staff')),
  ADD CONSTRAINT offline_workspace_commands_action_check CHECK (
    (module = 'menu' AND action IN ('update_product','update_category'))
    OR (module = 'staff' AND action IN ('leave_request','shift_change'))
  );
COMMIT;
