CREATE TABLE IF NOT EXISTS source_health (
 source_id TEXT PRIMARY KEY, last_checked TEXT NOT NULL, last_ok TEXT,
 state TEXT NOT NULL, last_items INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS source_health_state ON source_health(state,last_checked);
