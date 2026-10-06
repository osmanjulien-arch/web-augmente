import assert from 'node:assert/strict';
const base = process.env.MCP_BASE_URL || 'https://web-augmente-api.osmanjulien-arch.workers.dev';
const token = process.env.MCP_ACCESS_TOKEN;
if (!token) throw new Error('MCP_ACCESS_TOKEN requis (jeton OAuth MCP, pas le jeton Cloudflare).');
const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(20000) }).then(r => r.json());
assert.equal(health.version, '0.4.1');
if (process.env.EXPECTED_COMMIT) assert.equal(health.commit, process.env.EXPECTED_COMMIT);
let id = 0;
async function rpc(method, params) {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(90000)
  });
  assert.equal(response.ok, true, `MCP HTTP ${response.status}`);
  const text = await response.text();
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6))).find(d => d.id === id)
    : JSON.parse(text);
  assert.ok(data && !data.error, 'Réponse MCP invalide');
  return data.result;
}
await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ft-smoke', version: '0.4.1' } });
const checks = [
  ['france_travail_events_status', {}],
  ['france_travail_events_search', { size: 1 }],
  ['france_travail_jobs_search', { code_rome: 'I1316', commune: 'Grenoble', max_results: 1 }],
  ['france_travail_company_prospects', { code_rome: 'I1316', department_number: '38', page_size: 1 }],
  ['france_travail_stats_reference', { api: 'training', resource: 'activities', type_code: 'FORM14' }],
  ['france_travail_market_analysis', { rome_code: 'I1316', territory: { type: 'DEP', code: '38' }, include_salary: true, include_difficulty: true }],
  ['france_travail_training_analysis', { rome_code: 'I1316', territory: { type: 'DEP', code: '38' }, training_activity: { type: 'FORM14', code: '00101' }, postcode: '38000', include_market: false }]
];
let failed = false;
for (const [name, args] of checks) {
  try {
    const result = await rpc('tools/call', { name, arguments: args });
    const data = result.structuredContent || JSON.parse(result.content.find(c => c.type === 'text').text);
    const ok = !result.isError && !['unavailable', 'partial'].includes(data.status);
    console.log(JSON.stringify({ service: name, ok, status: data.status, error: data.error?.code, section_errors: data.section_errors }));
    failed ||= !ok;
    if (name === 'france_travail_jobs_search' && data.offers?.[0]?.id) checks.push(['france_travail_job_analyze', { offer_id: data.offers[0].id }]);
  } catch { console.log(JSON.stringify({ service: name, ok: false, error: 'smoke_failed' })); failed = true; }
}
if (failed) process.exitCode = 1;
