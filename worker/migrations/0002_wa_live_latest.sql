-- WA LIVE: latest voluntarily shared Safari page (single-row ephemeral snapshot)
-- High-frequency live snapshots use D1; historical manual captures remain in KV.
CREATE TABLE IF NOT EXISTS wa_live_latest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
