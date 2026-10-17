import { expect, it } from 'vitest';
import { normalizeOffer, processOffers } from '../src/employment-agent/core.js';
import { runEmploymentCycle, EMPLOYMENT_CRON } from '../src/employment-agent/runner.js';
import handler from '../src/index.js';

const baseOffer = () => ({
  id: '215BSBH',
  intitule: 'Technicien maintenance pompe à chaleur et climatisation',
  description: 'PAC, maintenance, dépannage et mise en service',
  entreprise: { nom: 'Entreprise démonstration' },
  lieuTravail: { libelle: '38 - Grenoble' },
  typeContratLibelle: 'CDI'
});
class MockDb {
  offers = new Map();
  candidates = new Map();
  runs = [];
  prepare(sql) {
    return { bind: (...p) => ({
      first: async () => this.offers.get(p[0]) || null,
      run: async () => {
        if (sql.includes('INSERT INTO agent_employment_offers')) {
          this.offers.set(p[0], { offer_key: p[0], content_hash: p[13], first_seen_at: p[14] });
        } else if (sql.includes('INSERT OR IGNORE INTO agent_employment_memory_candidates')) {
          this.candidates.set(p[0], { candidate_key: p[0], approval_status: 'pending_review' });
        } else if (sql.includes('INSERT INTO agent_employment_runs')) {
          this.runs.push({ status: p[3], metrics: JSON.parse(p[4]), error: p[5] });
        } else throw new Error('unexpected SQL');
        return { success: true };
      }
    }) };
  }
}

it('does not confuse observed France Travail data with verified facts', () => {
  const offer = normalizeOffer(baseOffer());
  expect(offer.evidence_status).toBe('source_observed');
  expect(offer.source_url).toContain('/offres/recherche/detail/215BSBH');
});

it('keeps raw contacts out of the D1 excerpts', () => {
  const offer = normalizeOffer({ ...baseOffer(), description: 'Envoyez à recruteur@example.fr sur https://example.fr/apply' });
  expect(offer.description_excerpt).not.toContain('recruteur@example.fr');
  expect(offer.description_excerpt).not.toContain('https://example.fr');
});

it('records a real scheduled cycle only once for an unchanged offer', async () => {
  const db = new MockDb();
  const source = async () => ({ fetched_at: '2026-10-16T19:00:00Z', offers: [baseOffer()] });
  const first = await runEmploymentCycle({ CONTEXT_DB: db }, { search: source });
  const second = await runEmploymentCycle({ CONTEXT_DB: db }, { search: source });
  expect(first.metrics.new).toBe(1);
  expect(second.metrics.unchanged).toBe(1);
  expect(db.candidates.size).toBe(1);
  expect(db.runs.map(x => x.status)).toEqual(['completed', 'completed']);
});

it('fails closed on broken sources and keeps the cron handler separate from OAuth fetch', async () => {
  const db = new MockDb();
  await expect(runEmploymentCycle({ CONTEXT_DB: db }, { search: async () => { throw Error('offline'); } })).rejects.toThrow('offline');
  expect(db.runs[0].status).toBe('failed');
  expect(EMPLOYMENT_CRON).toBe('0 */6 * * *');
  expect(typeof handler.fetch).toBe('function');
  expect(typeof handler.scheduled).toBe('function');
  let called = false;
  handler.scheduled({ cron: '0 3 * * *' }, {}, { waitUntil: () => { called = true; } });
  expect(called).toBe(false);
});
