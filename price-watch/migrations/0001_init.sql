CREATE TABLE IF NOT EXISTS leads (
  key TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT,
  first_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_watch_time ON leads(watch_id, first_seen DESC);
CREATE TABLE IF NOT EXISTS offers (
  key TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  condition TEXT NOT NULL,
  capacity_gb INTEGER NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offers_watch_best ON offers(watch_id, total_cents);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_key TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  FOREIGN KEY(offer_key) REFERENCES offers(key)
);
CREATE INDEX IF NOT EXISTS observations_watch_time ON observations(watch_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS alerts (
  offer_key TEXT PRIMARY KEY,
  last_total_cents INTEGER NOT NULL,
  last_sent_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  source_ok INTEGER NOT NULL,
  source_failed INTEGER NOT NULL,
  leads_added INTEGER NOT NULL,
  offers_seen INTEGER NOT NULL,
  alerts_sent INTEGER NOT NULL,
  errors_json TEXT NOT NULL
);
