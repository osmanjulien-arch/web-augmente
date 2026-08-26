const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = readFileSync(path.join(__dirname, '../scripts/core/wa-core-ios.user.js'), 'utf8');
const ENDPOINT = 'https://web-augmente-api.osmanjulien-arch.workers.dev/api/wa';
const TOKEN = 'test-only-token-not-a-production-secret';
const ENDPOINT_KEY = 'wa-core:endpoint';
const TOKEN_KEY = 'wa-core:token';

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.dataset = {};
    this.listeners = {};
    this.children = new Map();
    this.textContent = '';
    this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  setAttribute() {}
  addEventListener(name, handler) { this.listeners[name] = handler; }
  append() {}
  appendChild() {}
  attachShadow() { return new Element('shadow'); }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new Element());
    return this.children.get(selector);
  }
  querySelectorAll() { return []; }
  cloneNode() {
    const clone = new Element();
    clone.textContent = 'Texte public de test à mémoriser.';
    return clone;
  }
}

function harness({ store = new Map(), hostname = 'amazon.fr', answers = [], missingApi = false } = {}) {
  const elements = [];
  const calls = { prompts: [], requests: [], fallback: 0, writes: [] };
  const behavior = {
    response: ({ data }) => ({ status: 200, responseText: JSON.stringify({
      ok: true, action: JSON.parse(data).action, version: '0.1.0', status: 'new'
    }) })
  };
  const api = {
    async getValue(key, fallback) { return store.has(key) ? store.get(key) : fallback; },
    async setValue(key, value) { store.set(key, value); calls.writes.push(key); },
    async xmlHttpRequest(options) {
      calls.requests.push(options);
      return behavior.response(options);
    }
  };
  const context = vm.createContext({
    injectedApi: missingApi ? undefined : api,
    URL, Date, Set, Map,
    location: { href: `https://${hostname}/article`, hostname, pathname: '/article' },
    document: {
      title: `Page ${hostname}`, body: new Element('body'), documentElement: new Element('html'),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement(tag) { const element = new Element(tag); elements.push(element); return element; },
      createTextNode: (textContent) => ({ textContent })
    },
    prompt(message, defaultValue) { calls.prompts.push({ message, defaultValue }); return answers.shift() ?? null; },
    confirm: () => true,
    getSelection: () => ({ toString: () => 'Sélection de test volontaire.' }),
    setTimeout: () => 0, clearTimeout() {},
    // A privileged API regression must fail, never silently use page APIs.
    fetch() { calls.fallback++; throw new Error('page-fetch-must-not-run'); },
    localStorage: new Proxy({}, { get() { calls.fallback++; throw new Error('page-storage-must-not-run'); } })
  });
  // Reproduce Userscripts Safari's injection: GM is lexical, NOT globalThis.GM.
  vm.runInContext(`(function(GM) {\n${source}\n})(injectedApi);`, context);
  assert.equal(vm.runInContext('typeof globalThis.GM', context), 'undefined');
  const panel = elements.find((element) => element.id === 'wa-panel');
  return {
    api, behavior, calls, store, panel,
    status: () => panel.querySelector('#wa-status'),
    click: (action) => panel.querySelector(`[data-action="${action}"]`).listeners.click()
  };
}

test('metadata keeps script identity, grants, content isolation and version', () => {
  assert.match(source, /@name\s+Web Augmenté — WA Core iOS/);
  assert.match(source, /@namespace\s+https:\/\/github.com\/osmanjulien-arch\/web-augmente/);
  assert.match(source, /@version\s+0\.1\.1/);
  assert.match(source, /@inject-into\s+content/);
  for (const method of ['getValue', 'setValue', 'xmlHttpRequest']) {
    assert.ok(source.includes(`// @grant        GM.${method}`));
  }
  assert.equal(source.includes(TOKEN), false);
});

test('lexical GM is used for public health without asking for or sending a token', async () => {
  const h = harness({ store: new Map([[TOKEN_KEY, TOKEN]]) });
  await h.click('health');
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].url, ENDPOINT);
  assert.equal(h.calls.requests[0].headers.Authorization, undefined);
  assert.equal(h.status().className, 'success');
  assert.match(h.status().textContent, /ne valide pas le token/);
  assert.equal(h.calls.fallback, 0);
});

test('one configuration persists through reload and across sites using the same script storage', async () => {
  const store = new Map();
  const first = harness({ store, answers: [ENDPOINT, TOKEN] });
  await first.click('configure');
  assert.equal(first.status().className, 'success');
  assert.equal(first.calls.prompts.length, 2);
  assert.equal(first.calls.prompts[0].defaultValue, ENDPOINT);
  assert.equal(first.calls.prompts[1].defaultValue, '');
  assert.equal(store.get(TOKEN_KEY), TOKEN);
  for (const hostname of ['amazon.fr', 'example.org']) {
    const next = harness({ store, hostname });
    await next.click('send-selection');
    assert.equal(next.calls.prompts.length, 0);
    assert.equal(next.calls.requests.length, 1);
    const request = next.calls.requests[0];
    assert.equal(request.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(request.url.includes(TOKEN), false);
    assert.equal(request.data.includes(TOKEN), false);
    const body = JSON.parse(request.data);
    assert.equal(body.action, 'remember_page');
    assert.equal(body.page.domain, hostname);
    assert.equal(body.page.client_version, '0.1.1');
    assert.equal(body.page.content, 'Sélection de test volontaire.');
    assert.equal(next.status().className, 'success');
    assert.equal(next.calls.fallback, 0);
  }
});

test('a first private capture requests configuration once, then reuses it', async () => {
  const h = harness({ answers: [ENDPOINT, TOKEN] });
  await h.click('remember');
  await h.click('remember');
  assert.equal(h.calls.prompts.length, 2);
  assert.equal(h.calls.requests.length, 2);
  assert.equal(JSON.parse(h.calls.requests[0].data).page.status, 'remembered');
  assert.equal(h.calls.fallback, 0);
});

test('empty replacement token keeps the existing extension token', async () => {
  const h = harness({ store: new Map([[ENDPOINT_KEY, ENDPOINT], [TOKEN_KEY, TOKEN]]), answers: [ENDPOINT, ''] });
  await h.click('configure');
  assert.equal(h.store.get(TOKEN_KEY), TOKEN);
  assert.equal(h.calls.prompts[1].defaultValue, '');
  assert.equal(h.status().textContent.includes(TOKEN), false);
});

for (const action of ['configure', 'health', 'send-selection']) {
  test(`missing extension APIs fail closed before prompting: ${action}`, async () => {
    const h = harness({ missingApi: true });
    await h.click(action);
    assert.match(h.status().textContent, /API Userscripts indisponibles/);
    assert.equal(h.calls.prompts.length, 0);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.fallback, 0);
  });
}

test('a storage read failure is visible and does not ask for the token again', async () => {
  const h = harness({ store: new Map([[TOKEN_KEY, TOKEN]]) });
  h.api.getValue = async () => { throw new Error(TOKEN); };
  await h.click('send-selection');
  assert.match(h.status().textContent, /Lecture du stockage/);
  assert.equal(h.status().textContent.includes(TOKEN), false);
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.store.get(TOKEN_KEY), TOKEN);
  assert.equal(h.calls.fallback, 0);
});

for (const failure of ['reject', 'silent-write']) {
  test(`storage writes must be verified, with no page-storage fallback: ${failure}`, async () => {
    const h = harness({ answers: [ENDPOINT, TOKEN] });
    h.api.setValue = async () => { if (failure === 'reject') throw new Error(TOKEN); };
    await h.click('configure');
    assert.equal(h.status().className, 'error');
    assert.match(h.status().textContent, /Enregistrement Userscripts non confirmé/);
    assert.equal(h.status().textContent.includes(TOKEN), false);
    assert.equal(h.calls.fallback, 0);
  });
}

for (const failure of ['reject', 'zero', 'unauthorized', 'bad-json', 'bad-shape', 'bad-action']) {
  test(`request failure is visible, preserves token and never retries via fetch: ${failure}`, async () => {
    const h = harness({ store: new Map([[ENDPOINT_KEY, ENDPOINT], [TOKEN_KEY, TOKEN]]) });
    h.behavior.response = () => {
      if (failure === 'reject') throw new Error(`Load failed ${TOKEN}`);
      if (failure === 'zero') return { status: 0 };
      if (failure === 'unauthorized') return { status: 401, responseText: TOKEN };
      if (failure === 'bad-json') return { status: 200, responseText: '<html>not JSON</html>' };
      if (failure === 'bad-shape') return { status: 200, responseText: '{}' };
      return { status: 200, responseText: '{"ok":true,"action":"other"}' };
    };
    await h.click('send-selection');
    await h.click('send-selection');
    assert.equal(h.status().className, 'error');
    assert.equal(h.status().textContent.includes(TOKEN), false);
    assert.equal(h.calls.requests.length, 2);
    assert.equal(h.calls.prompts.length, 0);
    assert.equal(h.store.get(TOKEN_KEY), TOKEN);
    assert.equal(h.calls.fallback, 0);
  });
}

for (const endpoint of [
  'https://example.org/mcp', 'http://example.org/api/wa',
  'https://user:pass@example.org/api/wa', 'https://example.org/api/wa?token=unsafe',
  'https://example.org/api/wa#unsafe', 'ftp://localhost/api/wa'
]) {
  test(`invalid endpoint is rejected before sending credentials: ${endpoint}`, async () => {
    const h = harness({ store: new Map([[ENDPOINT_KEY, endpoint], [TOKEN_KEY, TOKEN]]) });
    await h.click('send-selection');
    assert.equal(h.status().className, 'error');
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.prompts.length, 0);
    assert.equal(h.calls.fallback, 0);
  });
}
