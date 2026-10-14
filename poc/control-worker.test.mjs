import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './remote-control-worker.mjs';

const origin = 'https://huggingface.co';
const sessionId = 'a'.repeat(48);
const env = () => ({
  ADMIN_TOKEN: 'a'.repeat(30),
  DEVICE_TOKEN: 'd'.repeat(30),
  ALLOWED_ORIGINS: origin,
  CONTROL_KV: new MemoryKV()
});
class MemoryKV {
  values = new Map();
  async get(key, type) {
    const value = this.values.get(key);
    if (!value) return null;
    return type === 'json' ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}
const headers = (token) => ({ authorization: 'Bearer ' + token, 'content-type': 'application/json' });
const request = (method, path, token, body) => new Request('https://test.worker' + path,
  { method, headers: headers(token), ...(body ? { body: JSON.stringify(body) } : {}) });
async function send(environment, method, path, token, body) {
  const response = await worker.fetch(request(method, path, token, body), environment);
  return { status: response.status, body: await response.json() };
}
const cmd = (extra = {}) => ({ sessionId, origin, type: 'fill',
  selector: 'input[name="username"]', value: 'agentlab-julien', ...extra });

test('unauthenticated command rejected', async () => {
  const state = env();
  const result = await send(state, 'POST', '/control/enqueue', 'bad', cmd());
  assert.equal(result.status, 401);
});

test('only allowlisted HTTPS origins accepted', async () => {
  const state = env();
  const malicious = await send(state, 'POST', '/control/enqueue', state.ADMIN_TOKEN,
    cmd({ origin: 'https://another.example' }));
  assert.equal(malicious.status, 400);
  const httpOrigin = await send(state, 'POST', '/control/enqueue', state.ADMIN_TOKEN,
    cmd({ origin: 'http://huggingface.co' }));
  assert.equal(httpOrigin.status, 400);
});

test('valid enqueue -> device poll -> result -> admin status', async () => {
  const state = env();
  const queued = await send(state, 'POST', '/control/enqueue', state.ADMIN_TOKEN, cmd());
  assert.equal(queued.status, 202);
  assert.equal(queued.body.status, 'pending');
  const poll = await send(state, 'GET',
    '/control/next?sessionId=' + sessionId + '&origin=' + encodeURIComponent(origin),
    state.DEVICE_TOKEN);
  assert.equal(poll.status, 200);
  assert.equal(poll.body.action.value, 'agentlab-julien');
  assert.equal(poll.body.action.id, queued.body.id);
  const reported = await send(state, 'POST', '/control/result', state.DEVICE_TOKEN,
    { sessionId, id: queued.body.id, status: 'rejected' });
  assert.equal(reported.status, 200);
  assert.equal(reported.body.status, 'rejected');
  const status = await send(state, 'GET',
    '/control/status?sessionId=' + sessionId + '&id=' + queued.body.id, state.ADMIN_TOKEN);
  assert.equal(status.body.status, 'rejected');
  const polledAgain = await send(state, 'GET',
    '/control/next?sessionId=' + sessionId + '&origin=' + encodeURIComponent(origin),
    state.DEVICE_TOKEN);
  assert.equal(polledAgain.body.action, null);
});

test('one pending command per session and click contains no value', async () => {
  const state = env();
  assert.equal((await send(state, 'POST', '/control/enqueue', state.ADMIN_TOKEN, cmd())).status, 202);
  assert.equal((await send(state, 'POST', '/control/enqueue', state.ADMIN_TOKEN, cmd())).status, 409);
  assert.equal((await send(env(), 'POST', '/control/enqueue', state.ADMIN_TOKEN,
    cmd({ type: 'click', value: 'injection' }))).status, 400);
});

test('cross-session reads are isolated', async () => {
  const state = env();
  assert.equal((await send(state, 'POST', '/control/enqueue', state.ADMIN_TOKEN, cmd())).status, 202);
  const wrong = await send(state, 'GET',
    '/control/next?sessionId=' + 'b'.repeat(48) + '&origin=' + encodeURIComponent(origin),
    state.DEVICE_TOKEN);
  assert.equal(wrong.body.action, null);
});
