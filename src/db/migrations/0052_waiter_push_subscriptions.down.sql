BEGIN;

-- Push endpoints are device capabilities. Removing this table revokes this app's server-side access to them.
DROP TABLE IF EXISTS push_subscriptions;

COMMIT;
