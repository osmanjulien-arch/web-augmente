import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { normalizeUrl } from '../src/index.js';

const TOKEN = 'test-token-with-at-least-twenty-characters';

class MemoryKV {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    const value = this.values.get(key) ?? null;
    if (value === null || type !== 'json') return value;
    return JSON.parse(value);
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }
}

function env() {
  return { WA_MEMORY: new MemoryKV(), WA_API_TOKEN: TOKEN };
}

function apiRequest(body, token = TOKEN) {
  return new Request('https://wa.example/api/wa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
}

function samplePage(content = 'Contenu utile de la page pour le test.') {
  return {
    url: 'https://Example.com/article/?utm_source=test&b=2&a=1#section',
    canonical_url: 'https://example.com/article/?b=2&a=1&utm_medium=email',
    title: 'Article de test',
    capture_type: 'page',
    content,
    status: 'inbox'
  };
}

test('health is public and CORS-enabled', async () => {
  const response = await worker.fetch(new Request('https://wa.example/api/wa?action=health'), env());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(data.ok, true);
  assert.equal(data.action, 'health');
});

test('private actions reject an invalid token', async () => {
  const response = await worker.fetch(apiRequest({ action: 'get_last_page' }, 'wrong-token'), env());
  const data = await response.json();
  assert.equal(response.status, 401);
  assert.equal(data.error, 'unauthorized');
});

test('URL normalization removes tracking and stabilizes query order', () => {
  assert.equal(
    normalizeUrl('HTTPS://Example.COM:443/article/?utm_source=x&b=2&a=1#part'),
    'https://example.com/article?a=1&b=2'
  );
});

test('remember_page returns new, already_seen, then changed with a stable id', async () => {
  const testEnv = env();
  const first = await worker.fetch(apiRequest({ action: 'remember_page', page: samplePage() }), testEnv);
  const firstData = await first.json();
  assert.equal(firstData.status, 'new');

  const second = await worker.fetch(apiRequest({ action: 'remember_page', page: samplePage() }), testEnv);
  const secondData = await second.json();
  assert.equal(secondData.status, 'already_seen');
  assert.equal(secondData.page.id, firstData.page.id);

  const third = await worker.fetch(apiRequest({
    action: 'remember_page',
    page: samplePage('Le contenu utile a réellement changé depuis la dernière visite.')
  }), testEnv);
  const thirdData = await third.json();
  assert.equal(thirdData.status, 'changed');
  assert.equal(thirdData.page.id, firstData.page.id);
});

test('get_last_page returns the latest captured text', async () => {
  const testEnv = env();
  await worker.fetch(apiRequest({ action: 'remember_page', page: samplePage('Dernière capture.') }), testEnv);
  const response = await worker.fetch(apiRequest({ action: 'get_last_page' }), testEnv);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'found');
  assert.equal(data.page.content, 'Dernière capture.');
  assert.equal(data.page.capture_type, 'page');
});

test('form fields sent as extra properties are not persisted', async () => {
  const testEnv = env();
  const page = { ...samplePage(), password: 'must-not-be-stored', cookies: 'also-no' };
  await worker.fetch(apiRequest({ action: 'remember_page', page }), testEnv);
  const response = await worker.fetch(apiRequest({ action: 'get_last_page' }), testEnv);
  const data = await response.json();
  assert.equal('password' in data.page, false);
  assert.equal('cookies' in data.page, false);
});
