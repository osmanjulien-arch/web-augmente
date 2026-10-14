ALTER TABLE indications ADD COLUMN family TEXT DEFAULT 'iphone';
ALTER TABLE indications ADD COLUMN generation INTEGER;
ALTER TABLE indications ADD COLUMN capacity_gb INTEGER;
ALTER TABLE indications ADD COLUMN memory_gb INTEGER;
ALTER TABLE indications ADD COLUMN chip TEXT;
ALTER TABLE indications ADD COLUMN llm_tier INTEGER;
CREATE INDEX IF NOT EXISTS idx_indications_family_capacity ON indications(family,generation,capacity_gb);
