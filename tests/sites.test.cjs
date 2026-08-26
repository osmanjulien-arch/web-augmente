const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const base = path.resolve(__dirname, '..');
const source = ['runtime', 'amazon', 'google', 'youtube', 'reddit', 'app'].map(name => fs.readFileSync(path.join(base, `src/sites/${name}.js`), 'utf8')).join('\n');
function fixture(body = '', url = 'https://www.amazon.fr/s?k=phone') {
  const { document, window } = parseHTML(`<html><head></head><body>${body}</body></html>`);
  const location = new URL(url), roots = [], observers = [], timers = new Map();
  let timerId = 0;
  const nativeAttach = window.Element.prototype.attachShadow;
  // Keep the application's closed root for tests only; production does not expose it.
  document.createElement = new Proxy(document.createElement, { apply(target, self, args) {
    const element = Reflect.apply(target, self, args);
    element.attachShadow = function (options) { const root = nativeAttach.call(this, options); roots.push(root); return root; };
    return element;
  } });
  class Observer {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
    fire() { if (this.connected) this.callback([]); }
  }
  const context = vm.createContext({ document, window, location, URL, console,
    MutationObserver: Observer,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(source, context);
  const effects = context.createSitesEffects(document);
  const modules = [...context.amazonSiteModules(), ...context.googleSiteModules(), ...context.youtubeSiteModules(), ...context.redditSiteModules()];
  return { document, window, location, roots, observers, context, effects, modules, timers,
    q: selector => document.querySelector(selector),
    run(id) { modules.find(module => module.id === id).run(context.createSitesContext(document, location, effects, id)); },
    flush() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } }
  };
}
function memory(saved = null) {
  const reads = [], writes = [];
  return { reads, writes, async getValue(key) { reads.push(key); return saved; }, async setValue(key, value) { writes.push({ key, value }); saved = value; } };
}
const hidden = el => el.hasAttribute('data-wa-sites-hidden');
const click = (f, selector) => f.roots[0].querySelector(selector).dispatchEvent(new f.window.Event('click'));
async function start(f, gm = memory()) { const app = f.context.startSitesApp(gm); await app.ready; return app; }

test('routeur : domaines exacts, recherche Google, exclusions sensibles', () => {
  const route = fixture().context.sitesRoute;
  for (const [host, pathname, expected] of [
    ['www.amazon.fr', '/dp/ABC', 'amazon'], ['amazon.fr', '/s', 'amazon'],
    ['amazon.fr.evil.test', '/s', null], ['fakeamazon.fr', '/s', null],
    ['www.amazon.fr', '/ap/signin', null], ['www.amazon.fr', '/gp/cart/view.html', null],
    ['www.amazon.fr', '/gp/buy/payselect/handlers', null], ['www.amazon.fr', '/gp/video/detail/ABC', null],
    ['www.amazon.fr', '/hz/checkout', null], ['www.google.fr', '/search', 'google'],
    ['www.google.fr', '/', null], ['accounts.google.com', '/search', null],
    ['m.youtube.com', '/', 'youtube'], ['www.youtube.com', '/account', null],
    ['www.reddit.com', '/r/test/', 'reddit'], ['www.reddit.com', '/login', null],
    ['www.reddit.com', '/settings/profile', null], ['example.com', '/', null]
  ]) assert.equal(route(host, pathname), expected, `${host}${pathname}`);
});

test('Amazon : sponsorisés masqués, DOM conservé et restauration exacte', () => {
  const f = fixture('<div id="ad" class="AdHolder">Ad</div><div id="normal">Produit</div>');
  const original = f.document.body.innerHTML;
  f.run('amazon-sponsored'); assert.ok(hidden(f.q('#ad'))); assert.ok(!hidden(f.q('#normal')));
  assert.ok(f.q('#ad').isConnected); f.effects.clear('amazon-sponsored');
  assert.equal(f.document.body.innerHTML, original);
});

test('Amazon : repère sponsorisé dans une carte, achat et mot de passe protégés', () => {
  const f = fixture('<div id="a" class="s-result-item"><span class="puis-sponsored-label-text">Sponsorisé</span></div><div id="buy" class="AdHolder"><button id="buy-now-button">Acheter</button></div><div id="auth" class="AdHolder"><input type="password"></div>');
  f.run('amazon-sponsored'); assert.ok(hidden(f.q('#a'))); assert.ok(!hidden(f.q('#buy'))); assert.ok(!hidden(f.q('#auth')));
});

test('Amazon : Rufus ciblé, module Prime facultatif et pas de balayage de texte', () => {
  const f = fixture('<div id="rufus-panel">Rufus</div><div id="prime-upsell" class="upsell">Offre</div><div id="book">Livre Prime et carte</div>');
  assert.equal(f.modules.find(m => m.id === 'amazon-upsells').defaultOn, false);
  f.run('amazon-rufus'); f.run('amazon-upsells');
  assert.ok(hidden(f.q('#rufus-panel'))); assert.ok(hidden(f.q('#prime-upsell'))); assert.ok(!hidden(f.q('#book')));
});

test('Amazon : badge vendeur explicite, aucune invention quand absent', () => {
  const f = fixture('<div id="buybox"><div id="merchant-info">Vendu par Atelier Test · Expédié par Amazon</div></div><div data-component-type="s-search-result"><span>Amazon téléphone</span></div>');
  f.run('amazon-sellers');
  assert.equal(f.q('[data-wa-sites-badge]').textContent, 'Vendeur indiqué : Atelier Test');
  assert.equal(f.document.querySelectorAll('[data-wa-sites-badge]').length, 1);
  f.effects.clear('amazon-sellers'); assert.equal(f.q('[data-wa-sites-badge]'), null);
});

test('Amazon : vendu par Amazon différent de expédié par Amazon', () => {
  const f = fixture('<div id="buybox"><div id="merchant-info">Vendu par Amazon.fr</div></div>');
  f.run('amazon-sellers'); assert.equal(f.q('[data-wa-sites-badge]').textContent, 'Vendu par Amazon');
});

test('Google : lien direct, paramètres destination conservés, ping restauré', () => {
  const target = 'https://example.org/page?sku=123&signature=abc&utm_source=needed#part';
  const href = '/url?q=' + encodeURIComponent(target);
  const f = fixture(`<a id="a" href="${href}" ping="/track" data-ved="123" jsaction="click:foo">Résultat</a>`, 'https://www.google.fr/search?q=test');
  f.run('google-direct-links'); const a = f.q('#a');
  assert.equal(a.getAttribute('href'), target); assert.equal(a.getAttribute('ping'), null);
  assert.equal(a.getAttribute('jsaction'), 'click:foo');
  f.effects.clear('google-direct-links'); assert.equal(a.getAttribute('href'), href);
  assert.equal(a.getAttribute('ping'), '/track'); assert.equal(a.getAttribute('data-ved'), '123');
});

test('Google : imgres, liens internes, schémas dangereux et hôtes trompeurs', () => {
  const f = fixture('<a id="image" href="/imgres?imgurl=https%3A%2F%2Fexample.org%2Fpic.jpg">Image</a><a id="internal" href="/search?q=more" ping="/p">Plus</a><a id="bad" href="/url?q=javascript%3Aalert(1)">Bad</a><a id="creds" href="/url?q=https%3A%2F%2Fuser%3Apass%40example.org">Bad</a><a id="fake" href="https://google.com.evil.test/url?q=https%3A%2F%2Fexample.org">Fake</a>', 'https://www.google.com/search?q=test');
  f.run('google-direct-links'); assert.equal(f.q('#image').getAttribute('href'), 'https://example.org/pic.jpg');
  assert.equal(f.q('#internal').getAttribute('ping'), '/p');
  assert.ok(f.q('#bad').getAttribute('href').startsWith('/url?'));
  assert.ok(f.q('#creds').getAttribute('href').startsWith('/url?'));
  assert.ok(f.q('#fake').getAttribute('href').startsWith('https://google.com.evil.test/'));
});

test('Google : publicités identifiées seulement', () => {
  const f = fixture('<div id="tads">Ad</div><div id="organic">Texte sponsored ordinaire</div>', 'https://www.google.fr/search?q=test');
  f.run('google-sponsored'); assert.ok(hidden(f.q('#tads'))); assert.ok(!hidden(f.q('#organic')));
});

test('journal : ne pas écraser une modification de lien ultérieure du site', () => {
  const f = fixture('<a id="a" href="/before">Lien</a>');
  f.effects.attr(f.q('#a'), 'href', '/wa', 'test'); f.q('#a').setAttribute('href', '/site-new');
  f.effects.clear('test'); assert.equal(f.q('#a').getAttribute('href'), '/site-new');
});

test('journal : plusieurs propriétaires et attribut hidden préexistant', () => {
  const f = fixture('<div id="a" hidden="until-found"></div>');
  f.effects.hide(f.q('#a'), 'a'); f.effects.hide(f.q('#a'), 'b');
  f.effects.clear('a'); assert.ok(hidden(f.q('#a')));
  f.effects.clear('b'); assert.equal(f.q('#a').getAttribute('hidden'), 'until-found'); assert.ok(!hidden(f.q('#a')));
  f.effects.hide(f.document.body, 'a'); assert.ok(!hidden(f.document.body));
});

test('YouTube : Shorts masqués, cartes normales et mixtes conservées', () => {
  const f = fixture('<ytm-reel-shelf-renderer id="shelf">Shorts</ytm-reel-shelf-renderer><ytd-rich-item-renderer id="short"><a href="/shorts/id">Court</a></ytd-rich-item-renderer><ytd-rich-item-renderer id="normal"><a href="/watch?v=id">Vidéo</a></ytd-rich-item-renderer><ytd-rich-item-renderer id="mixed"><a href="/shorts/id">Court</a><a href="/watch?v=id">Long</a></ytd-rich-item-renderer>', 'https://m.youtube.com/');
  f.run('youtube-shorts'); for (const id of ['shelf', 'short']) assert.ok(hidden(f.q('#' + id)));
  for (const id of ['normal', 'mixed']) assert.ok(!hidden(f.q('#' + id)));
});

test('YouTube : Short ouvert volontairement non modifié', () => {
  const f = fixture('<ytm-reel-shelf-renderer id="shelf">Shorts</ytm-reel-shelf-renderer>', 'https://m.youtube.com/shorts/abc');
  f.run('youtube-shorts'); assert.ok(!hidden(f.q('#shelf')));
});

test('YouTube : publications communautaires masquées, section ordinaire conservée', () => {
  const f = fixture('<ytm-rich-section-renderer id="community"><ytm-backstage-post-renderer>Publication</ytm-backstage-post-renderer></ytm-rich-section-renderer><ytd-rich-section-renderer id="desktop"><ytd-post-renderer>Post</ytd-post-renderer></ytd-rich-section-renderer><ytm-rich-section-renderer id="ordinary"><a href="/watch?v=abc">Vidéo</a></ytm-rich-section-renderer>', 'https://m.youtube.com/');
  f.run('youtube-community-posts');
  assert.ok(hidden(f.q('#community'))); assert.ok(hidden(f.q('#desktop'))); assert.ok(!hidden(f.q('#ordinary')));
});

test('YouTube : nouveau renderer détecté par son lien de publication', () => {
  const f = fixture('<ytm-rich-item-renderer id="post"><unknown-renderer><a href="/post/Ugkx123">Publication</a></unknown-renderer></ytm-rich-item-renderer><ytm-rich-item-renderer id="video"><a href="/watch?v=abc">Vidéo</a></ytm-rich-item-renderer>', 'https://m.youtube.com/');
  f.run('youtube-community-posts'); assert.ok(hidden(f.q('#post'))); assert.ok(!hidden(f.q('#video')));
});

test('YouTube : post et onglet Communauté ouverts volontairement conservés', () => {
  for (const url of ['https://m.youtube.com/post/Ugkx123', 'https://www.youtube.com/@channel/community']) {
    const f = fixture('<ytm-post-renderer id="post">Publication</ytm-post-renderer>', url);
    f.run('youtube-community-posts'); assert.ok(!hidden(f.q('#post')), url);
  }
});

test('YouTube : SponsorBlock est facultatif et ne saute jamais la vidéo', async () => {
  const calls = [];
  const gm = { xmlHttpRequest: async options => {
    calls.push(options);
    return { status: 200, responseText: JSON.stringify([
      { segment: [10, 20], category: 'sponsor' },
      { segment: [25, 24], category: 'invalid' }
    ]) };
  } };
  const f = fixture('<video id="video"></video><div class="ytp-progress-list" id="bar"></div>', 'https://m.youtube.com/watch?v=abcDEF_1234');
  Object.defineProperty(f.q('#video'), 'duration', { value: 100, configurable: true });
  const module = f.context.youtubeSiteModules(gm).find(item => item.id === 'youtube-sponsorblock');
  assert.equal(module.defaultOn, false);
  const pending = module.run(f.context.createSitesContext(f.document, f.location, f.effects, module.id));
  await pending;
  module.run(f.context.createSitesContext(f.document, f.location, f.effects, module.id));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/sponsor\.ajay\.app\/api\/skipSegments\?/);
  assert.equal(f.document.querySelectorAll('.wa-sponsorblock-segment').length, 1);
  assert.equal(f.q('#video').currentTime || 0, 0);
  f.effects.clear(module.id);
  assert.equal(f.document.querySelectorAll('.wa-sponsorblock-segment').length, 0);
});

test('YouTube : SponsorBlock ne contacte rien hors vidéo ou sans permission', () => {
  let calls = 0;
  const gm = { xmlHttpRequest: async () => { calls++; return { status: 200, responseText: '[]' }; } };
  const home = fixture('', 'https://m.youtube.com/');
  home.context.youtubeSiteModules(gm).find(item => item.id === 'youtube-sponsorblock')
    .run(home.context.createSitesContext(home.document, home.location, home.effects, 'youtube-sponsorblock'));
  const watch = fixture('<video></video><div class="ytp-progress-list"></div>', 'https://m.youtube.com/watch?v=abcDEF_1234');
  watch.context.youtubeSiteModules(null).find(item => item.id === 'youtube-sponsorblock')
    .run(watch.context.createSitesContext(watch.document, watch.location, watch.effects, 'youtube-sponsorblock'));
  assert.equal(calls, 0);
});

test('Reddit : invitation app ciblée, texte de publication et connexion conservés', () => {
  const f = fixture('<div id="app" role="dialog">Open in app<a href="https://reddit.app.link/test">Open</a></div><div id="login" role="dialog">Open in app<form><input type="password"></form><a href="reddit://test">Open</a></div><article id="post">Open in app<a href="reddit://test">Test</a></article><div id="other" role="dialog">Cookie consent<a href="https://apps.apple.com/test">app</a></div>', 'https://www.reddit.com/r/test');
  f.run('reddit-app-prompts'); assert.ok(hidden(f.q('#app')));
  for (const id of ['login', 'post', 'other']) assert.ok(!hidden(f.q('#' + id)));
});

test('Reddit : dialogue natif ouvert et éditeur exclus, détection FR', () => {
  const f = fixture('<dialog id="native" role="dialog" open>Open in app<a href="reddit://test">App</a></dialog><div id="editor" role="dialog">Open in app<div contenteditable></div><a href="reddit://test">App</a></div><div id="fr" class="XPromoPopup">Ouvrir dans l’application<a href="https://apps.apple.com/app/reddit">Ouvrir</a></div>', 'https://www.reddit.com/r/test');
  f.run('reddit-app-prompts'); assert.ok(!hidden(f.q('#native'))); assert.ok(!hidden(f.q('#editor'))); assert.ok(hidden(f.q('#fr')));
});

test('application : démarrage automatique, pause réversible et reprise', async () => {
  const f = fixture('<div id="ad" class="AdHolder">Ad</div>'); const app = await start(f);
  assert.ok(hidden(f.q('#ad'))); assert.equal(f.observers.length, 1);
  click(f, '.compare'); assert.ok(!hidden(f.q('#ad'))); assert.equal(f.observers[0].connected, false);
  click(f, '.compare'); assert.ok(hidden(f.q('#ad'))); assert.equal(f.observers[0].connected, true);
  app.stop(); assert.ok(!hidden(f.q('#ad'))); assert.equal(f.q('#wa-sites-ios-host'), null);
});

test('application : préférence mémorisée, clé séparée du Core et du token', async () => {
  const gm = memory(); const f = fixture('<div id="ad" class="AdHolder">Ad</div>'); const app = await start(f, gm);
  const input = f.roots[0].querySelector('[data-module="amazon-sponsored"]'); input.checked = false;
  input.dispatchEvent(new f.window.Event('change')); await new Promise(resolve => setImmediate(resolve));
  assert.ok(!hidden(f.q('#ad'))); assert.equal(gm.writes.length, 1);
  assert.deepEqual(gm.reads, ['wa-sites:settings:v1']); assert.equal(gm.writes[0].key, 'wa-sites:settings:v1');
  app.stop(); const next = fixture('<div id="ad" class="AdHolder">Ad</div>'); await start(next, gm);
  assert.ok(!hidden(next.q('#ad')));
});

test('application : stockage absent, choix temporaire explicite', async () => {
  const f = fixture('<div id="ad" class="AdHolder">Ad</div>'); await start(f, null);
  assert.ok(!hidden(f.q('#ad'))); assert.match(f.roots[0].querySelector('.status').textContent, /pause/);
  click(f, '.temporary'); assert.ok(hidden(f.q('#ad')));
});

test('application : préférences invalides ne déclenchent pas un nettoyage silencieux', async () => {
  const f = fixture('<div id="ad" class="AdHolder">Ad</div>'); await start(f, memory({ version: 1, modules: { 'amazon-sponsored': 'yes' } }));
  assert.ok(!hidden(f.q('#ad')));
});

test('application : échec de sauvegarde expliqué, arrêt local effectif', async () => {
  const f = fixture('<div id="ad" class="AdHolder">Ad</div>'); const gm = memory(); gm.setValue = async () => { throw new Error('denied'); };
  await start(f, gm); const input = f.roots[0].querySelector('[data-module="amazon-sponsored"]');
  input.checked = false; input.dispatchEvent(new f.window.Event('change'));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!hidden(f.q('#ad'))); assert.match(f.roots[0].querySelector('.status').textContent, /non enregistré/);
});

test('application : contenu dynamique traité, mutations groupées, aucune minuterie permanente', async () => {
  const f = fixture(); await start(f);
  const ad = f.document.createElement('div'); ad.className = 'AdHolder'; f.document.body.appendChild(ad);
  f.observers[0].fire(); f.observers[0].fire(); assert.equal(f.timers.size, 1);
  f.flush(); assert.ok(hidden(ad)); assert.equal(f.timers.size, 0);
  ad.className = 'ordinary'; f.observers[0].fire(); f.flush(); assert.ok(!hidden(ad));
});

test('application : route SPA sensible restaurée, puis reprise', async () => {
  const f = fixture('<div id="ad" class="AdHolder">Ad</div>'); const app = await start(f);
  f.location.pathname = '/gp/buy/checkout'; f.window.dispatchEvent(new f.window.Event('popstate')); f.flush();
  assert.ok(!hidden(f.q('#ad'))); assert.equal(f.q('#wa-sites-ios-host').style.display, 'none');
  f.location.pathname = '/s'; app.run(); assert.ok(hidden(f.q('#ad')));
});

test('application : navigation YouTube vers Short restaure les éléments', async () => {
  const f = fixture('<ytm-reel-shelf-renderer id="short">Shorts</ytm-reel-shelf-renderer>', 'https://m.youtube.com/'); await start(f);
  assert.ok(hidden(f.q('#short'))); f.location.pathname = '/shorts/abc';
  f.window.dispatchEvent(new f.window.Event('yt-navigate-finish')); f.flush(); assert.ok(!hidden(f.q('#short')));
});

test('application : page masquée / bfcache suspend les observations', async () => {
  const f = fixture(); await start(f);
  f.document.hidden = true; f.document.dispatchEvent(new f.window.Event('visibilitychange')); assert.equal(f.observers[0].connected, false);
  f.document.hidden = false; f.document.dispatchEvent(new f.window.Event('visibilitychange')); assert.equal(f.observers[0].connected, true);
  f.window.dispatchEvent(new f.window.Event('pagehide')); assert.equal(f.observers[0].connected, false);
  f.window.dispatchEvent(new f.window.Event('pageshow')); assert.equal(f.observers[0].connected, true);
});

test('application : aucun panneau ni changement sur route exclue au chargement', () => {
  const f = fixture('<div class="AdHolder">Ad</div>', 'https://www.amazon.fr/ap/signin');
  assert.equal(f.context.startSitesApp(memory()), null); assert.equal(f.roots.length, 0);
});

test('application : ouvert/fermé et modules affichés selon le site', async () => {
  const f = fixture('', 'https://m.youtube.com/'); await start(f); const root = f.roots[0];
  assert.equal(root.querySelector('.panel').hidden, true); click(f, '.launcher'); assert.equal(root.querySelector('.panel').hidden, false);
  assert.equal(root.querySelector('[data-module="youtube-shorts"]').closest('label').hidden, false);
  assert.equal(root.querySelector('[data-module="amazon-sponsored"]').closest('label').hidden, true);
  click(f, '.close'); assert.equal(root.querySelector('.panel').hidden, true);
});

test('bundle : GM lexical Safari, réseau limité à SponsorBlock et aucun stockage page', async () => {
  const bundle = fs.readFileSync(path.join(base, 'scripts/sites/wa-sites-ios.user.js'), 'utf8');
  for (const forbidden of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bsetInterval\s*\(/, /\beval\s*\(/, /@require\s/]) assert.doesNotMatch(bundle, forbidden);
  assert.match(bundle, /@grant\s+GM\.xmlHttpRequest/);
  assert.match(bundle, /@connect\s+sponsor\.ajay\.app/);
  assert.equal((bundle.match(/https:\/\/sponsor\.ajay\.app/g) || []).length, 1);
  const f = fixture('<div id="ad" class="AdHolder">Ad</div>'), gm = memory();
  const run = vm.runInContext(`(function(GM){${bundle}\n})`, f.context);
  assert.equal(f.context.GM, undefined); run(gm); await new Promise(resolve => setImmediate(resolve));
  assert.ok(hidden(f.q('#ad'))); assert.equal(f.roots.length, 1);
  run(gm); assert.equal(f.roots.length, 1);
});
