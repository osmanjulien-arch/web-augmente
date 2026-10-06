import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as franceTravail from '../src/france-travail.js';
import {
  franceTravailMarketAnalysis, franceTravailTrainingAnalysis,
  franceTravailCompanyProspects, resetFranceTravailTokenCacheForTests
} from '../src/france-travail.js';

const env = { FRANCE_TRAVAIL_CLIENT_ID: 'fake-client', FRANCE_TRAVAIL_CLIENT_SECRET: 'fake-secret' };
async function record(run) {
  const previous = globalThis.fetch;
  const calls = [];
  resetFranceTravailTokenCacheForTests();
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return String(url).includes('/oauth2/access_token')
      ? Response.json({ access_token: 'fake-token', expires_in: 3600 })
      : Response.json({ valeur: 1, items: [], hits: 0 });
  };
  try { await run(calls); }
  finally { globalThis.fetch = previous; resetFranceTravailTokenCacheForTests(); }
}
const bodyOf = (calls, path) => JSON.parse(calls.find(c => c.url.pathname.endsWith(path)).init.body);

test('each market indicator has its own required nomenclature and period', async () => {
  await record(async calls => {
    const result = await franceTravailMarketAnalysis(env, { rome_code: 'I1302', include_difficulty: true });
    const offers = bodyOf(calls, '/stat-offres');
    assert.equal(offers.codeTypeTerritoire, 'NAT');
    assert.equal(offers.codeTerritoire, 'FR');
    assert.equal(offers.codeTypeNomenclature, 'ORIGINEOFF');
    assert.equal(bodyOf(calls, '/stat-acces-emploi').codeTypeNomenclature, 'DUREEEMP');
    const difficulty = bodyOf(calls, '/stat-perspective-employeur');
    assert.equal(difficulty.codeTypeNomenclature, 'TYPE_TENSION');
    assert.equal(difficulty.codeTypePeriode, 'ANNEE');
    assert.deepEqual(result.section_criteria.recruitment_difficulty, difficulty);
  });
});

test('explicit periods are JSON arrays and do not silently select latest period', async () => {
  await record(async calls => {
    await franceTravailMarketAnalysis(env, {
      rome_code: 'I1302', territory: { type: 'DEP', code: '38' },
      period_codes: ['2026T1', '2026T2'], nomenclature_codes: 'PE, TOFF',
      nomenclature_type: 'ORIGINEOFF', include_difficulty: true
    });
    const offers = bodyOf(calls, '/stat-offres');
    assert.deepEqual(offers.listeCodePeriode, ['2026T1', '2026T2']);
    assert.deepEqual(offers.listeCodeNomenclature, ['PE', 'TOFF']);
    assert.equal(offers.dernierePeriode, false);
    assert.equal(bodyOf(calls, '/stat-acces-emploi').codeTypeNomenclature, 'DUREEEMP');
    assert.equal('listeCodeNomenclature' in bodyOf(calls, '/stat-acces-emploi'), false);
    assert.equal('listeCodePeriode' in bodyOf(calls, '/stat-perspective-employeur'), false);
  });
});

test('salary uses the documented GET path and codeRome query', async () => {
  await record(async calls => {
    await franceTravailMarketAnalysis(env, { rome_code: 'I1302', include_salary: true });
    const salary = calls.find(c => c.url.pathname.includes('/salaire-rome-fap/'));
    assert.ok(salary);
    assert.equal(salary.url.pathname.endsWith('/NAT/FR'), true);
    assert.equal(salary.init.method, 'GET');
    assert.equal(salary.url.searchParams.get('codeRome'), 'I1302');
    assert.equal(salary.init.body, undefined);
  });
});

test('training outcome activity is explicit and never overwrites the ROME of exits', async () => {
  await record(async calls => {
    const result = await franceTravailTrainingAnalysis(env, {
      rome_code: 'I1302', territory: { type: 'DEP', code: '38' },
      training_activity: { type: 'FORM14', code: '00101' }, include_market: false
    });
    const access = bodyOf(calls, '/stat-acces-emploi-sorties-formation');
    assert.equal(access.codeTypeActivite, 'FORM14');
    assert.equal(access.codeActivite, '00101');
    assert.equal(access.codeTypeNomenclature, 'ACCESEMP');
    const exits = bodyOf(calls, '/stat-demandeurs-sorties-formation');
    assert.equal(exits.codeTypeActivite, 'ROME');
    assert.equal(exits.codeActivite, 'I1302');
    assert.equal('codeTypeNomenclature' in exits, false);
    assert.deepEqual(result.section_criteria.training_access_to_employment, access);
  });
});

test('without formation activity, unsupported ROME outcomes are not queried', async () => {
  await record(async calls => {
    const result = await franceTravailTrainingAnalysis(env, { rome_code: 'I1302', include_market: false });
    assert.equal(calls.some(c => c.url.pathname.endsWith('/stat-acces-emploi-sorties-formation')), false);
    assert.equal(result.sections.training_access_to_employment, null);
    assert.equal(result.not_requested.training_access_to_employment, 'training_activity_required');
    assert.ok(result.warnings.some(w => /training_activity/.test(w)));
  });
});

test('La Bonne Boite uses the official recherche endpoint and all required scopes', async () => {
  await record(async calls => {
    await franceTravailCompanyProspects(env, { code_rome: 'I1302', department_number: 38 });
    const search = calls.find(c => c.url.pathname.endsWith('/labonneboite/v2/recherche'));
    assert.ok(search);
    const token = calls.find(c => c.url.pathname.includes('/oauth2/access_token'));
    const scopes = new URLSearchParams(token.init.body).get('scope').split(' ');
    for (const scope of ['api_labonneboitev2', 'search', 'office']) assert.ok(scopes.includes(scope));
    assert.deepEqual(search.url.searchParams.getAll('department_number'), ['38']);
  });
});

test('invalid training activity is rejected before any request starts', async () => {
  await record(async calls => {
    await assert.rejects(franceTravailTrainingAnalysis(env, {
      rome_code: 'I1302', training_activity: { type: 'FORM14' }
    }), error => error.code === 'france_travail_invalid_training_activity');
    assert.equal(calls.length, 0);
  });
});

test('formation reference resolves the official FORM14 domain list', async () => {
  await record(async calls => {
    assert.equal(typeof franceTravail.franceTravailStatsReference, 'function');
    const result = await franceTravail.franceTravailStatsReference(env, {
      api: 'training', resource: 'activities', type_code: 'FORM14'
    });
    const request = calls.find(c => c.url.pathname.endsWith('/referentiel/activites/FORM14'));
    assert.ok(request);
    assert.equal(request.init.method, 'GET');
    assert.equal(result.api, 'training');
  });
});

test('reference requests cannot choose an arbitrary API or URL', async () => {
  await record(async calls => {
    assert.equal(typeof franceTravail.franceTravailStatsReference, 'function');
    await assert.rejects(franceTravail.franceTravailStatsReference(env, {
      api: 'https://example.com', resource: 'activities'
    }), error => error.status === 400);
    assert.equal(calls.length, 0);
  });
});

test('commune names resolve to INSEE codes before offers search', async () => {
  const previous = globalThis.fetch;
  resetFranceTravailTokenCacheForTests();
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    if (String(url).includes('/oauth2/access_token')) return Response.json({ access_token: 'fake-token', expires_in: 3600 });
    if (String(url).endsWith('/referentiel/communes')) return Response.json([{ code: '38185', libelle: 'Grenoble', codePostal: '38000' }]);
    return Response.json({ resultats: [] });
  };
  try {
    const result = await franceTravail.franceTravailJobsSearch(env, { code_rome: 'I1316', commune: 'Grenoble' });
    assert.equal(result.request.filters.commune, '38185');
    assert.equal(urls.find(u => u.pathname.endsWith('/offres/search')).searchParams.get('commune'), '38185');
  } finally { globalThis.fetch = previous; resetFranceTravailTokenCacheForTests(); }
});

test('INSEE codes bypass the commune reference', async () => {
  await record(async calls => {
    const result = await franceTravail.franceTravailJobsSearch(env, { code_rome: 'I1316', commune_code: '38185' });
    assert.equal(result.request.filters.commune, '38185');
    assert.equal(calls.some(c => c.url.pathname.endsWith('/referentiel/communes')), false);
  });
});

test('ambiguous commune names fail before offers search', async () => {
  const previous = globalThis.fetch;
  resetFranceTravailTokenCacheForTests();
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return String(url).includes('/oauth2/access_token') ? Response.json({ access_token: 'fake-token', expires_in: 3600 }) : Response.json([{ libelle: 'Saint-Pierre', code: '11111' }, { libelle: 'Saint-Pierre', code: '22222' }]);
  };
  try {
    await assert.rejects(franceTravail.franceTravailJobsSearch(env, { code_rome: 'I1316', commune: 'Saint-Pierre' }), e => e.code === 'france_travail_invalid_commune');
    assert.equal(urls.some(u => u.includes('/offres/search')), false);
  } finally { globalThis.fetch = previous; resetFranceTravailTokenCacheForTests(); }
});

test('source encodings and published versions remain aligned', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.equal(pkg.version, '0.4.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.ok(source.includes(`const API_VERSION = '${pkg.version}';`));
  for (const path of ['index.js', 'france-travail.js']) {
    const bytes = await readFile(new URL('../src/' + path, import.meta.url));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.equal(/Ã|â€|Â/.test(text), false);
  }
});
