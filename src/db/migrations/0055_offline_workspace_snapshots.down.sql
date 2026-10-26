-- Workspace snapshots can be referenced by queued local commands. Preserve them
-- unless an operator has exported/confirmed they are no longer needed.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM offline_workspace_snapshots) THEN
    RAISE EXCEPTION 'Refusing to drop non-empty offline workspace snapshots; export or reconcile local commands first.';
  END IF;
END $$;
DROP TABLE IF EXISTS offline_workspace_snapshots;
COMMIT;
