// Proof of concept ONLY: isolated Cloudflare Worker, not wired to production.
// Bind a KV namespace as CONTROL_KV and set ADMIN_TOKEN, DEVICE_TOKEN,
// ALLOWED_ORIGINS as Cloudflare secrets/vars. Never commit token values.
const MAX_BODY_BYTES = 4096;
const SESSION_RE = /^[a-f0-9]{48}$/;
const ACTION_TYPES = new Set(['click', 'fill']);
const TTL_SECONDS = 120;
const RESULT_TTL_SECONDS = 600;

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

function authorized(request, secret) {
  return typeof secret === 'string' && secret.length >= 24 &&
    request.headers.get('authorization') === 'Bearer ' + secret;
}
function validOrigin(origin, env) {
  if (typeof origin !== 'string' || origin.length > 200) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) return false;
    return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes(origin);
  } catch { return false; }
}
function validSession(value) { return typeof value === 'string' && SESSION_RE.test(value); }
function queueKey(sessionId) { return 'control:q:' + sessionId; }
function resultKey(sessionId, id) { return 'control:r:' + sessionId + ':' + id; }

async function requestJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error('Payload too large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('Payload too large');
  return JSON.parse(text);
}
function validateAction(input, env) {
  if (!input || !validSession(input.sessionId) || !validOrigin(input.origin, env) ||
      !ACTION_TYPES.has(input.type) ||
      typeof input.selector !== 'string' ||
      !input.selector.trim() || input.selector.length > 180 ||
      /[\r\n{};]/.test(input.selector)) return false;
  if (input.type === 'fill' &&
      (typeof input.value !== 'string' || input.value.length > 160 ||
       /[\r\n]/.test(input.value))) return false;
  if (input.type === 'click' && input.value !== undefined) return false;
  return true;
}

export default {
  async fetch(request, env) {
    if (!env.CONTROL_KV || !env.ADMIN_TOKEN || !env.DEVICE_TOKEN ||
        !env.ALLOWED_ORIGINS) {
      return reply({ error: 'Worker not configured' }, 503);
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === 'POST' && path === '/control/enqueue') {
        if (!authorized(request, env.ADMIN_TOKEN)) return reply({ error: 'Unauthorized' }, 401);
        const input = await requestJson(request);
        if (!validateAction(input, env)) return reply({ error: 'Invalid action or origin' }, 400);
        const key = queueKey(input.sessionId);
        const existing = await env.CONTROL_KV.get(key, 'json');
        if (existing) return reply({ error: 'Session already has a pending action' }, 409);
        // KV is eventually consistent: a single writer is assumed in this POC.
        const job = { id: crypto.randomUUID(), sessionId: input.sessionId,
          origin: input.origin, type: input.type, selector: input.selector,
          ...(input.type === 'fill' ? { value: input.value } : {}),
          expiresAt: Date.now() + TTL_SECONDS * 1000 };
        await env.CONTROL_KV.put(key, JSON.stringify(job), { expirationTtl: TTL_SECONDS });
        return reply({ id: job.id, status: 'pending', expiresAt: job.expiresAt }, 202);
      }

      if (request.method === 'GET' && path === '/control/next') {
        if (!authorized(request, env.DEVICE_TOKEN)) return reply({ error: 'Unauthorized' }, 401);
        const sessionId = url.searchParams.get('sessionId');
        const origin = url.searchParams.get('origin');
        if (!validSession(sessionId) || !validOrigin(origin, env))
          return reply({ error: 'Invalid session or origin' }, 400);
        const job = await env.CONTROL_KV.get(queueKey(sessionId), 'json');
        if (!job || job.origin !== origin || Date.now() >= job.expiresAt)
          return reply({ action: null });
        return reply({ action: job });
      }

      if (request.method === 'POST' && path === '/control/result') {
        if (!authorized(request, env.DEVICE_TOKEN)) return reply({ error: 'Unauthorized' }, 401);
        const data = await requestJson(request);
        if (!data || !validSession(data.sessionId) ||
            typeof data.id !== 'string' ||
            !/^[a-f0-9-]{36}$/.test(data.id) ||
            !['approved', 'rejected', 'error'].includes(data.status))
          return reply({ error: 'Invalid result' }, 400);
        const key = queueKey(data.sessionId);
        const job = await env.CONTROL_KV.get(key, 'json');
        if (!job || job.id !== data.id) return reply({ error: 'No matching pending job' }, 409);
        const result = { id: data.id, status: data.status,
          at: new Date().toISOString() };
        await env.CONTROL_KV.put(resultKey(data.sessionId, data.id),
          JSON.stringify(result), { expirationTtl: RESULT_TTL_SECONDS });
        await env.CONTROL_KV.delete(key);
        return reply(result);
      }

      if (request.method === 'GET' && path === '/control/status') {
        if (!authorized(request, env.ADMIN_TOKEN)) return reply({ error: 'Unauthorized' }, 401);
        const sessionId = url.searchParams.get('sessionId');
        const id = url.searchParams.get('id');
        if (!validSession(sessionId) || !id || !/^[a-f0-9-]{36}$/.test(id))
          return reply({ error: 'Invalid lookup' }, 400);
        const result = await env.CONTROL_KV.get(resultKey(sessionId, id), 'json');
        if (result) return reply(result);
        const pending = await env.CONTROL_KV.get(queueKey(sessionId), 'json');
        return reply({ id, status: pending?.id === id ? 'pending' : 'unknown' });
      }

      return reply({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof SyntaxError || /Payload too large/.test(String(error)))
        return reply({ error: 'Invalid JSON or oversized body' }, 400);
      return reply({ error: 'Internal error' }, 500);
    }
  }
};
