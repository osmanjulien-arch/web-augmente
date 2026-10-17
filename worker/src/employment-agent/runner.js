import { franceTravailJobsSearch } from '../france-travail.js';
import { processOffers } from './core.js';
import { createD1Storage } from './storage.js';

export const EMPLOYMENT_CRON = '0 */6 * * *';
export const EMPLOYMENT_QUERY = Object.freeze({
  query: 'technicien maintenance pompe à chaleur',
  departement: '38',
  publiee_depuis: 7,
  max_results: 25
});

/**
 * Uses RFT's existing Cloudflare secrets and the already deployed CONTEXT_DB.
 * This function does not modify the memory MCP heads/revisions: it only writes
 * evidence observations and pending memory candidates to agent_employment_*.
 */
export async function runEmploymentCycle(env, options = {}) {
  if (!env?.CONTEXT_DB) throw new Error('missing_context_db');
  const search = options.search || franceTravailJobsSearch;
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let status = 'failed';
  let metrics = {};
  let errorCode = '';
  try {
    const result = await search(env, EMPLOYMENT_QUERY);
    if (!Array.isArray(result?.offers)) throw new Error('invalid_source_result');
    metrics = await processOffers(result.offers, createD1Storage(env.CONTEXT_DB), {
      now: startedAt, minimumScore: 55
    });
    status = 'completed';
    return { run_id: runId, status, fetched_at: result.fetched_at, metrics };
  } catch (error) {
    errorCode = String(error?.code || error?.name || 'unknown').slice(0, 100);
    throw error;
  } finally {
    await env.CONTEXT_DB.prepare(
      'INSERT INTO agent_employment_runs (run_id, started_at, completed_at, status, metrics_json, error_code) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      runId, startedAt, new Date().toISOString(), status, JSON.stringify(metrics), errorCode
    ).run();
  }
}
