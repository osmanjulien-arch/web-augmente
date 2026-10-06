import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  franceTravailTrainingAnalysis, franceTravailMarketAnalysis,
  franceTravailCompanyProspects, resetFranceTravailTokenCacheForTests
} from '../src/france-travail.js';

const env = { FRANCE_TRAVAIL_CLIENT_ID: 'test-client', FRANCE_TRAVAIL_CLIENT_SECRET: 'test-secret' };

async function withApi(handler, run) {
  const previous = globalThis.fetch;
  resetFranceTravailTokenCacheForTests();
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://entreprise.francetravail.fr/connexion/oauth2/access_token')) {
      return Response.json({ access_token: 'fake-token', expires_in: 3600 });
    }
    return handler(new URL(url), init);
  };
  try { await run(); }
  finally { globalThis.fetch = previous; resetFranceTravailTokenCacheForTests(); }
}

test('postcode-only reviews are explicitly unrelated to the requested ROME', async () => {
  await withApi(url => url.pathname.includes('/anotea/')
    ? Response.json({ avis: [{ formation: { intitule: 'Tests TOEIC' } }] })
    : Response.json({ valeur: 1 }), async () => {
    const result = await franceTravailTrainingAnalysis(env, {
      rome_code: 'I1302', postcode: '38000', include_market: false
    });
    assert.equal(result.anotea_context.rome_filter_applied, false);
    assert.equal(result.anotea_context.scope, 'geographique');
    assert.deepEqual(result.anotea_context.filters, { lieu_de_formation: '38000' });
    assert.ok(result.warnings.some(warning => /ROME/.test(warning)));
    assert.equal(result.sections.anotea_reviews.avis[0].formation.intitule, 'Tests TOEIC');
  });
});

test('formation filters and pagination are forwarded with an explicit Anotea scope', async () => {
  let queried;
  await withApi(url => {
    if (url.pathname.includes('/anotea/')) queried = url;
    return Response.json({ avis: [] });
  }, async () => {
    const result = await franceTravailTrainingAnalysis(env, {
      rome_code: 'I1308', certif_info: ' 88141 ', formacode: '22635',
      postcode: '38000', organisme_formateur: '82070200900011',
      page: 2, items_per_page: 5, include_market: false
    });
    assert.equal(queried.searchParams.get('certif_info'), '88141');
    assert.equal(queried.searchParams.get('formacode'), '22635');
    assert.equal(queried.searchParams.get('organisme_formateur'), '82070200900011');
    assert.equal(queried.searchParams.get('page'), '2');
    assert.equal(result.anotea_context.scope, 'formation');
    assert.equal(result.anotea_context.rome_filter_applied, false);
    assert.equal(result.status, 'ok');
  });
});

test('whitespace-only filters never launch a global Anotea request', async () => {
  let queried = false;
  await withApi(url => {
    if (url.pathname.includes('/anotea/')) queried = true;
    return Response.json({ valeur: 1 });
  }, async () => {
    const result = await franceTravailTrainingAnalysis(env, {
      rome_code: 'I1302', postcode: '   ', include_market: false
    });
    assert.equal(queried, false);
    assert.equal(result.sections.anotea_reviews, null);
    assert.equal(result.anotea_context.scope, null);
    assert.equal(result.status, 'ok');
  });
});

test('partial market data retain a safe actionable HTTP diagnostic', async () => {
  await withApi(url => url.pathname.includes('stats-offres-demandes')
    ? Response.json({ valeur: 42 })
    : Response.json({ message: 'do not echo upstream-secret' }, { status: 403 }), async () => {
    const result = await franceTravailMarketAnalysis(env, { rome_code: 'I1302' });
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.sections.offers_statistics, { valeur: 42 });
    assert.equal(result.sections.access_to_employment, null);
    assert.equal(result.section_errors.access_to_employment.status, 403);
    assert.equal(result.section_errors.access_to_employment.code, 'france_travail_forbidden');
    assert.match(result.section_errors.access_to_employment.endpoint, /stat-acces-emploi$/);
    assert.equal(JSON.stringify(result).includes('upstream-secret'), false);
  });
});

test('an analysis with all upstreams failing is explicitly unavailable', async () => {
  await withApi(() => Response.json({}, { status: 400 }), async () => {
    const result = await franceTravailMarketAnalysis(env, { rome_code: 'I1302' });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.section_errors.offers_statistics.status, 400);
    assert.equal(result.section_errors.access_to_employment.status, 400);
  });
});

test('training includes nested market failures in its overall status', async () => {
  await withApi(url => url.pathname.includes('stats-entrees-sorties')
    ? Response.json({ valeur: 1 }) : Response.json({}, { status: 403 }), async () => {
    const result = await franceTravailTrainingAnalysis(env, { rome_code: 'I1302' });
    assert.equal(result.status, 'partial');
    assert.equal(result.market.status, 'unavailable');
    assert.ok(result.warnings.some(warning => /marché/.test(warning)));
  });
});

test('La Bonne Boite 403 is an access refusal and does not leak upstream text', async () => {
  let attempts = 0;
  await withApi(() => {
    attempts += 1;
    return Response.json({ message: 'upstream-secret' }, { status: 403 });
  }, async () => {
    await assert.rejects(
      franceTravailCompanyProspects(env, { code_rome: 'I1302', department: '38' }),
      error => error.code === 'france_travail_forbidden' && error.status === 403
        && !error.message.includes('upstream-secret')
    );
    assert.equal(attempts, 1);
  });
});
