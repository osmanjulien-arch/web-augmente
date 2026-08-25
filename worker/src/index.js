const API_VERSION = '0.1.0';
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_CONTENT_CHARS = 40000;
const MAX_SELECTION_CHARS = 20000;
const PAGE_KEY_PREFIX = 'page:';
const LAST_PAGE_KEY = 'meta:last_page';
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_', 'si',
  'spm', 'yclid', '_ga', '_gl'
]);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store'
  };
}

function jsonResponse(data, status = 200, requestId = crypto.randomUUID()) {
  return Response.json({ ...data, request_id: requestId }, {
    status,
    headers: corsHeaders()
  });
}

function normalizeText(value, maxLength) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function normalizeUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw new HttpError(400, 'invalid_url', 'URL absente ou invalide.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new HttpError(400, 'invalid_url', 'Seules les URL HTTP(S) sont acceptées.');
  }
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function tokensMatch(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(left, right);
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function requireAuthentication(request, env) {
  if (!env.WA_API_TOKEN || env.WA_API_TOKEN.length < 20) {
    throw new HttpError(503, 'server_not_configured', 'WA_API_TOKEN absent ou trop court côté serveur.');
  }
  const authorization = request.headers.get('Authorization') || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!provided || !(await tokensMatch(provided, env.WA_API_TOKEN))) {
    throw new HttpError(401, 'unauthorized', 'Token Web Augmenté invalide.');
  }
}

async function readJsonBounded(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type application/json requis.');
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, 'payload_too_large', 'Requête trop volumineuse.');
  }
  if (!request.body) throw new HttpError(400, 'empty_body', 'Corps JSON absent.');

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'payload_too_large', 'Requête trop volumineuse.');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON invalide.');
  }
}

function parsePage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'invalid_page', 'Objet page absent.');
  }
  const canonicalUrl = normalizeUrl(input.canonical_url || input.url);
  const captureType = input.capture_type === 'selection' ? 'selection' : 'page';
  const maxContent = captureType === 'selection' ? MAX_SELECTION_CHARS : MAX_CONTENT_CHARS;
  const content = normalizeText(input.content, maxContent);
  if (!content) throw new HttpError(400, 'empty_content', 'Aucun contenu utile reçu.');
  const requestedStatus = input.status === 'remembered' ? 'remembered' : 'inbox';
  return {
    canonical_url: canonicalUrl,
    source_url: normalizeUrl(input.url || canonicalUrl),
    title: normalizeText(input.title, 500) || canonicalUrl,
    domain: new URL(canonicalUrl).hostname,
    description: normalizeText(input.description, 1000),
    language: normalizeText(input.language, 20),
    captured_at: normalizeText(input.captured_at, 40) || null,
    client_version: normalizeText(input.client_version, 30) || null,
    capture_type: captureType,
    content,
    requested_status: requestedStatus
  };
}

function pageWasAnalyzed(record) {
  return Boolean(record?.summary || record?.previous_analysis || record?.analysis_version);
}

function mergeStatus(previous, requested) {
  if (previous === 'remembered' || requested === 'remembered') return 'remembered';
  return 'inbox';
}

async function rememberPage(env, rawPage) {
  const page = parsePage(rawPage);
  const now = new Date().toISOString();
  const id = await sha256Hex(page.canonical_url);
  const contentHash = await sha256Hex(page.content);
  const key = `${PAGE_KEY_PREFIX}${id}`;
  const existing = await env.WA_MEMORY.get(key, 'json');

  let resultStatus = 'new';
  if (existing) {
    const comparisonHash = page.capture_type === 'selection'
      ? existing.last_selection?.content_hash
      : existing.content_hash;
    if (comparisonHash && comparisonHash !== contentHash) resultStatus = 'changed';
    else resultStatus = pageWasAnalyzed(existing) ? 'already_analyzed' : 'already_seen';
  }

  const baseRecord = existing || {
    id,
    canonical_url: page.canonical_url,
    title: page.title,
    domain: page.domain,
    first_seen: now,
    last_seen: now,
    content_hash: null,
    status: page.requested_status,
    tags: [],
    summary: null,
    key_facts: [],
    previous_analysis: null,
    recommendations: [],
    open_questions: [],
    next_actions: [],
    related_pages: [],
    analysis_version: null,
    capture_count: 0
  };

  const record = {
    ...baseRecord,
    canonical_url: page.canonical_url,
    title: page.title,
    domain: page.domain,
    last_seen: now,
    status: mergeStatus(baseRecord.status, page.requested_status),
    description: page.description || baseRecord.description || '',
    language: page.language || baseRecord.language || '',
    source_url: page.source_url,
    capture_count: Number(baseRecord.capture_count || 0) + 1
  };

  if (page.capture_type === 'page') {
    record.content_hash = contentHash;
    record.content_excerpt = page.content;
    if (resultStatus === 'changed') record.changed_at = now;
  } else {
    record.last_selection = {
      content_hash: contentHash,
      content: page.content,
      captured_at: now
    };
  }

  const lastCapture = {
    id,
    canonical_url: page.canonical_url,
    source_url: page.source_url,
    title: page.title,
    domain: page.domain,
    captured_at: now,
    client_captured_at: page.captured_at,
    client_version: page.client_version,
    capture_type: page.capture_type,
    content_hash: contentHash,
    content: page.content,
    status: record.status
  };

  await Promise.all([
    env.WA_MEMORY.put(key, JSON.stringify(record)),
    env.WA_MEMORY.put(LAST_PAGE_KEY, JSON.stringify(lastCapture))
  ]);

  return {
    status: resultStatus,
    page: {
      id,
      canonical_url: record.canonical_url,
      title: record.title,
      domain: record.domain,
      first_seen: record.first_seen,
      last_seen: record.last_seen,
      content_hash: contentHash,
      capture_type: page.capture_type,
      memory_status: record.status,
      character_count: page.content.length
    }
  };
}

async function getLastPage(env) {
  return env.WA_MEMORY.get(LAST_PAGE_KEY, 'json');
}

async function routeRequest(request, env, requestId) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (!['/api/wa', '/health'].includes(url.pathname)) {
    throw new HttpError(404, 'not_found', 'Endpoint inconnu. Utilise /api/wa.');
  }

  if (request.method === 'GET') {
    const action = url.pathname === '/health' ? 'health' : url.searchParams.get('action');
    if (action !== 'health') throw new HttpError(405, 'method_not_allowed', 'GET accepte uniquement health.');
    return jsonResponse({ ok: true, action: 'health', version: API_VERSION, storage: 'kv' }, 200, requestId);
  }

  if (request.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'Méthode non autorisée.');
  }

  const body = await readJsonBounded(request);
  if (body.action === 'health') {
    return jsonResponse({ ok: true, action: 'health', version: API_VERSION, storage: 'kv' }, 200, requestId);
  }

  await requireAuthentication(request, env);
  if (body.action === 'remember_page') {
    const result = await rememberPage(env, body.page);
    console.log(JSON.stringify({
      message: 'page remembered',
      request_id: requestId,
      action: body.action,
      status: result.status,
      page_id: result.page.id,
      domain: result.page.domain
    }));
    return jsonResponse({ ok: true, action: body.action, ...result }, 200, requestId);
  }
  if (body.action === 'get_last_page') {
    const page = await getLastPage(env);
    return jsonResponse({ ok: true, action: body.action, status: page ? 'found' : 'empty', page }, 200, requestId);
  }
  throw new HttpError(400, 'unknown_action', 'Action non prise en charge dans la V1.');
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      return await routeRequest(request, env, requestId);
    } catch (error) {
      const known = error instanceof HttpError;
      const status = known ? error.status : 500;
      const code = known ? error.code : 'internal_error';
      const message = known ? error.message : 'Erreur interne du serveur.';
      console.error(JSON.stringify({
        message: 'request failed',
        request_id: requestId,
        status,
        code,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error)
      }));
      return jsonResponse({ ok: false, error: code, message }, status, requestId);
    }
  }
};

export { getLastPage, normalizeUrl, rememberPage };
