-- Merchant list prices. Shipping is explicitly unknown and must not enter confirmed all-in offers.
CREATE TABLE IF NOT EXISTS indications (
  key TEXT PRIMARY KEY, watch_id TEXT NOT NULL, source_id TEXT NOT NULL,
  merchant TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
  price_cents INTEGER NOT NULL, shipping_status TEXT NOT NULL DEFAULT 'unknown',
  first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS indications_best ON indications(watch_id,price_cents);
CREATE TABLE IF NOT EXISTS indication_observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, indication_key TEXT NOT NULL,
 watch_id TEXT NOT NULL, price_cents INTEGER NOT NULL, observed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS indication_alerts (
 indication_key TEXT PRIMARY KEY, last_price_cents INTEGER NOT NULL, last_sent_at TEXT NOT NULL
);
