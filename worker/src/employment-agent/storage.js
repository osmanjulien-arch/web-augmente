// Tables are isolated from the existing context-memory-mcp memory tables.
// Candidate promotion to MCP memory_save is deliberately NOT automatic.
export function createD1Storage(db) {
  if (!db || typeof db.prepare !== 'function') throw new Error('CONTEXT_DB D1 binding required');
  return {
    async get(key) {
      return db.prepare(
        'SELECT offer_key, content_hash, first_seen_at FROM agent_employment_offers WHERE offer_key = ?'
      ).bind(key).first();
    },
    async upsert(item) {
      return db.prepare(`
        INSERT INTO agent_employment_offers (
          offer_key, external_id, title, company, location, salary, contract,
          source_url, source_updated_at, description_excerpt, relevance_score,
          reasons_json, evidence_status, content_hash, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(offer_key) DO UPDATE SET
          title=excluded.title, company=excluded.company, location=excluded.location,
          salary=excluded.salary, contract=excluded.contract, source_url=excluded.source_url,
          source_updated_at=excluded.source_updated_at, description_excerpt=excluded.description_excerpt,
          relevance_score=excluded.relevance_score, reasons_json=excluded.reasons_json,
          evidence_status=excluded.evidence_status, content_hash=excluded.content_hash,
          last_seen_at=excluded.last_seen_at
      `).bind(
        item.offer_key, item.external_id, item.title, item.company, item.location,
        item.salary, item.contract, item.source_url, item.source_updated_at,
        item.description_excerpt, item.relevance_score, JSON.stringify(item.reasons),
        item.evidence_status, item.content_hash, item.first_seen_at, item.last_seen_at
      ).run();
    },
    async enqueueCandidate(item) {
      return db.prepare(`
        INSERT OR IGNORE INTO agent_employment_memory_candidates (
          candidate_key, offer_key, content_hash, summary, source_url,
          evidence_status, approval_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?)
      `).bind(
        item.candidate_key, item.offer_key, item.content_hash, item.summary,
        item.source_url, item.evidence_status, item.created_at
      ).run();
    }
  };
}
