-- Append-only revisions. No existing WA_MEMORY/OAUTH_KV data is used.
CREATE TABLE IF NOT EXISTS context_revisions (
  key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  project TEXT NOT NULL,
  tags TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  source_created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key, version)
);
-- statement-break
CREATE TABLE IF NOT EXISTS context_heads (
  key TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  project TEXT NOT NULL,
  tags TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- statement-break
CREATE INDEX IF NOT EXISTS context_heads_project_updated ON context_heads(project, updated_at DESC, key);
-- statement-break
CREATE INDEX IF NOT EXISTS context_heads_updated ON context_heads(updated_at DESC, key);
-- statement-break
CREATE TRIGGER IF NOT EXISTS context_revisions_index AFTER INSERT ON context_revisions
BEGIN
  INSERT INTO context_heads(key, version, project, tags, status, summary, updated_at)
  VALUES (NEW.key, NEW.version, NEW.project, NEW.tags, NEW.status, NEW.summary, NEW.updated_at)
  ON CONFLICT(key) DO UPDATE SET version=excluded.version, project=excluded.project,
    tags=excluded.tags, status=excluded.status, summary=excluded.summary, updated_at=excluded.updated_at;
END;
-- statement-break
CREATE TRIGGER IF NOT EXISTS context_revisions_immutable_update BEFORE UPDATE ON context_revisions
BEGIN
  SELECT RAISE(ABORT, 'immutable_revision');
END;
-- statement-break
CREATE TRIGGER IF NOT EXISTS context_revisions_immutable_delete BEFORE DELETE ON context_revisions
BEGIN
  SELECT RAISE(ABORT, 'immutable_revision');
END;
