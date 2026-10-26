BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_commands WHERE module = 'staff') THEN
    RAISE EXCEPTION 'Refusing to remove offline staff commands while request history exists';
  END IF;
END $$;
ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_module_check;
ALTER TABLE offline_workspace_commands DROP CONSTRAINT IF EXISTS offline_workspace_commands_action_check;
ALTER TABLE offline_workspace_commands
  ADD CONSTRAINT offline_workspace_commands_module_check CHECK (module = 'menu'),
  ADD CONSTRAINT offline_workspace_commands_action_check CHECK (action IN ('update_product','update_category'));
COMMIT;
