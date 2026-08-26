// ==UserScript==
// @name         Web Augmenté — WA Sites iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.2.0
// @description  Améliorations réversibles Amazon, Google, Reddit et YouTube, avec segments SponsorBlock facultatifs.
// @match        https://amazon.fr/*
// @match        https://*.amazon.fr/*
// @match        https://google.fr/*
// @match        https://www.google.fr/*
// @match        https://google.com/*
// @match        https://www.google.com/*
// @match        https://reddit.com/*
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      sponsor.ajay.app
// @inject-into  content
// @updateURL    https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/sites/wa-sites-ios.user.js
// @downloadURL  https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/sites/wa-sites-ios.user.js
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('wa-sites-ios-host')) return;
  const sitesGM = typeof GM !== 'undefined' && GM ? GM : null;
  // Source: src/sites/runtime.js
// Mutation journals only restore values still owned by WA. Original DOM is never removed.
function createSitesEffects(doc) {
  const hidden = new Map();
  const journals = new Map();
  const badges = new Map();
  const inserted = new Map();
  const ensure = (map, key) => { if (!map.has(key)) map.set(key, new Map()); return map.get(key); };
  const restore = (el, name, value) => { if (value === null) el.removeAttribute(name); else el.setAttribute(name, value); };

  function hide(el, owner) {
    if (!el || el === doc.body || el === doc.documentElement || el.closest('[data-wa-ui]')) return;
    let record = hidden.get(el);
    if (!record) {
      record = { owners: new Set(), hidden: el.getAttribute('hidden'), marker: el.getAttribute('data-wa-sites-hidden') };
      hidden.set(el, record);
    }
    record.owners.add(owner);
    el.setAttribute('data-wa-sites-hidden', '1');
    el.setAttribute('hidden', '');
  }

  function attr(el, name, value, owner) {
    const nodes = ensure(journals, owner);
    const attrs = ensure(nodes, el);
    const current = el.getAttribute(name);
    let record = attrs.get(name);
    if (current === value) return;
    if (!record || current !== record.applied) record = { original: current };
    record.applied = value; attrs.set(name, record); restore(el, name, value);
  }

  function badge(anchor, text, owner) {
    const items = ensure(badges, owner);
    let item = items.get(anchor);
    if (!item || !item.isConnected) {
      item = doc.createElement('span'); item.dataset.waUi = '1'; item.dataset.waSitesBadge = owner;
      item.style.cssText = 'display:inline-block;margin:6px;padding:4px 8px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#111827;font:600 12px system-ui';
      anchor.insertAdjacentElement('afterend', item); items.set(anchor, item);
    }
    if (item.textContent !== text) item.textContent = text;
  }

  function insert(anchor, item, owner) {
    if (!anchor || !item || !anchor.isConnected) return;
    item.dataset.waUi = '1';
    anchor.appendChild(item);
    if (!inserted.has(owner)) inserted.set(owner, new Set());
    inserted.get(owner).add(item);
  }

  function clear(owner) {
    for (const [el, record] of hidden) {
      record.owners.delete(owner);
      if (!record.owners.size) {
        if (el.getAttribute('hidden') === '') restore(el, 'hidden', record.hidden);
        if (el.getAttribute('data-wa-sites-hidden') === '1') restore(el, 'data-wa-sites-hidden', record.marker);
        hidden.delete(el);
      }
    }
    for (const [el, attrs] of journals.get(owner) || []) {
      for (const [name, record] of attrs) if (el.getAttribute(name) === record.applied) restore(el, name, record.original);
    }
    journals.delete(owner);
    for (const item of (badges.get(owner) || new Map()).values()) item.remove();
    badges.delete(owner);
    for (const item of inserted.get(owner) || []) item.remove();
    inserted.delete(owner);
  }

  function prune() {
    for (const [el] of hidden) if (!el.isConnected) hidden.delete(el);
    for (const nodes of journals.values()) for (const [el] of nodes) if (!el.isConnected) nodes.delete(el);
    for (const items of badges.values()) for (const [anchor, item] of items) {
      if (!anchor.isConnected) { item.remove(); items.delete(anchor); }
    }
    for (const items of inserted.values()) for (const item of items) if (!item.isConnected) items.delete(item);
  }

  function count(owner) {
    return [...hidden].filter(([el, r]) => el.isConnected && r.owners.has(owner)).length +
      [...(journals.get(owner) || new Map()).keys()].filter(el => el.isConnected).length +
      [...(badges.get(owner) || new Map()).values()].filter(el => el.isConnected).length +
      [...(inserted.get(owner) || new Set())].filter(el => el.isConnected).length;
  }
  return { hide, attr, badge, insert, clear, prune, count };
}

function sitesRoute(hostname, pathname) {
  const host = hostname.toLowerCase();
  if (/(^|\.)amazon\.fr$/.test(host)) {
    if (/^\/(?:ap(?:\/|$)|checkout|gp\/(?:buy|cart|video|your-account|wallet)|hz\/(?:checkout|contact-us)|a\/addresses)/i.test(pathname)) return null;
    return 'amazon';
  }
  if (['google.fr','www.google.fr','google.com','www.google.com'].includes(host)) return pathname === '/search' ? 'google' : null;
  if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
    return /^\/(?:signin|account|paid_memberships)/.test(pathname) ? null : 'youtube';
  }
  if (['reddit.com','www.reddit.com','old.reddit.com'].includes(host)) {
    return /^\/(?:login|register|account|settings|checkout|premium)(?:\/|$)/.test(pathname) ? null : 'reddit';
  }
  return null;
}

function createSitesContext(doc, location, effects, owner) {
  return {
    doc, location,
    all: selector => [...doc.querySelectorAll(selector)].filter(el => !el.closest('[data-wa-ui]')),
    hide: el => effects.hide(el, owner),
    attr: (el, name, value) => effects.attr(el, name, value, owner),
    badge: (el, text) => effects.badge(el, text, owner),
    insert: (el, item) => effects.insert(el, item, owner),
    safeHttp(raw) {
      try {
        const url = new URL(raw, location.href);
        return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
      } catch { return null; }
    }
  };
}

// Source: src/sites/amazon.js
// Functional reuse of Amazon Clean 0.2.3. No removal, purchase submission, or remote calls.
function amazonSiteModules() {
  const purchase = '#add-to-cart-button,#buy-now-button,[name="submit.add-to-cart"],input[type="password"]';
  const safeHide = (ctx, el) => { if (el && !el.matches(purchase) && !el.querySelector(purchase)) ctx.hide(el); };
  return [
    { id: 'amazon-sponsored', site: 'amazon', label: 'Masquer les résultats et blocs sponsorisés', defaultOn: true,
      run(ctx) {
        ctx.all('[data-component-type^="sp-sponsored"],[data-component-type="s-sponsored-result"],[data-cel-widget^="sp_"],.AdHolder,[id^="sp_detail"],iframe[src*="amazon-adsystem"]')
          .forEach(el => safeHide(ctx, el));
        ctx.all('.puis-sponsored-label-text,.s-sponsored-label-text,[data-ad-details],[data-adfeedbackdetails]')
          .forEach(el => safeHide(ctx, el.closest('[data-component-type="s-search-result"],.s-result-item,.s-widget-container,[data-asin][data-index]')));
      } },
    { id: 'amazon-rufus', site: 'amazon', label: 'Masquer les blocs Rufus', defaultOn: true,
      run(ctx) {
        ctx.all('[id^="rufus" i],[id^="nav-rufus" i],[data-testid^="rufus" i],[class~="rufus-container"]')
          .forEach(el => safeHide(ctx, el));
      } },
    { id: 'amazon-upsells', site: 'amazon', label: 'Masquer les encarts Prime/carte identifiés (option)', defaultOn: false,
      run(ctx) {
        // Intentionally no text scan of arbitrary divs: product titles can mention Prime/cards.
        ctx.all('[id*="prime" i][class*="upsell" i],[class~="prime-upsell"],[id="prime-interstitial"],[id="credit-card-upsell"],[class~="credit-card-upsell"]')
          .forEach(el => safeHide(ctx, el));
      } },
    { id: 'amazon-sellers', site: 'amazon', label: 'Signaler le vendeur quand il est identifiable', defaultOn: true,
      run(ctx) {
        const containers = ctx.all('[data-component-type="s-search-result"],#desktop_buybox,#buybox');
        for (const box of containers) {
          if (box.closest('[data-wa-sites-hidden]')) continue;
          const candidates = [...box.querySelectorAll('#merchant-info,#sellerProfileTriggerId,[offer-display-feature-name="desktop-merchant-info"],.tabular-buybox-text')];
          for (const anchor of candidates) {
            const text = anchor.textContent.replace(/\s+/g, ' ').trim();
            const match = text.match(/(?:vendu(?:e)?\s+par|sold\s+by|expéditeur\s*\/\s*vendeur)\s*:?\s*([^|•·;]+)/i);
            if (!match) continue;
            const seller = match[1].split(/\s+(?:expédié par|ships from)/i)[0].trim().slice(0, 120);
            if (!seller) continue;
            ctx.badge(anchor, /^amazon(?:\.fr| eu|\.com)?$/i.test(seller) ? 'Vendu par Amazon' : `Vendeur indiqué : ${seller}`);
            break;
          }
          // Unknown is not guessed from product names or the whole card text.
        }
      } }
  ];
}

// Source: src/sites/google.js
function googleSiteModules() {
  return [
    { id: 'google-sponsored', site: 'google', label: 'Masquer les blocs publicitaires identifiés', defaultOn: true,
      run(ctx) { ctx.all('#tads,#tadsb,#bottomads,[data-text-ad="1"]').forEach(el => ctx.hide(el)); } },
    { id: 'google-direct-links', site: 'google', label: 'Liens directs sans redirection Google', defaultOn: true,
      run(ctx) {
        for (const a of ctx.all('a[href]')) {
          const current = ctx.safeHttp(a.getAttribute('href'));
          if (!current) continue;
          let target = current;
          if (['google.com','www.google.com','google.fr','www.google.fr'].includes(current.hostname) && ['/url','/imgres'].includes(current.pathname)) {
            const raw = current.pathname === '/imgres' ? current.searchParams.get('imgurl') : current.searchParams.get('url') || current.searchParams.get('q');
            if (!raw || !/^https?:\/\//i.test(raw)) continue;
            target = ctx.safeHttp(raw);
            if (!target) continue;
            ctx.attr(a, 'href', target.href);
          }
          if (target.hostname !== ctx.location.hostname && !['google.fr','google.com','www.google.fr','www.google.com'].includes(target.hostname)) {
            ctx.attr(a, 'ping', null);
            ctx.attr(a, 'data-ved', null);
          }
          // Keep destination query parameters, signed URLs and jsaction handlers intact.
        }
      } }
  ];
}

// Source: src/sites/youtube.js
function youtubeSiteModules(GM) {
  const sponsorCache = new Map();
  const sponsorCategories = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic'];

  function sponsorSegments(ctx) {
    if (ctx.location.pathname !== '/watch') return;
    const videoId = new URL(ctx.location.href).searchParams.get('v');
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId || '')) return;
    const video = ctx.doc.querySelector('video');
    const bar = ctx.doc.querySelector('.ytp-progress-list,.player-controls-progress-bar');
    const cached = sponsorCache.get(videoId);
    if (cached && cached.state === 'ready' && video && bar && Number.isFinite(video.duration) && video.duration > 0) {
      for (const row of cached.rows) {
        const segment = Array.isArray(row.segment) ? row.segment : [];
        const start = Number(segment[0]), end = Number(segment[1]);
        if (!(start >= 0 && end > start && end <= video.duration + 2)) continue;
        const marker = ctx.doc.createElement('span');
        marker.className = 'wa-sponsorblock-segment';
        marker.title = `SponsorBlock : ${String(row.category || 'segment')}`;
        marker.style.cssText = `position:absolute;left:${start / video.duration * 100}%;width:${(end - start) / video.duration * 100}%;top:0;bottom:0;background:#00b894;pointer-events:none;z-index:9`;
        ctx.insert(bar, marker);
      }
      return;
    }
    if (cached || !GM || typeof GM.xmlHttpRequest !== 'function') return;
    sponsorCache.set(videoId, { state: 'loading' });
    const url = 'https://sponsor.ajay.app/api/skipSegments?videoID=' + encodeURIComponent(videoId) + '&categories=' + encodeURIComponent(JSON.stringify(sponsorCategories));
    return Promise.resolve(GM.xmlHttpRequest({ method: 'GET', url, timeout: 10000, headers: { Accept: 'application/json' } }))
      .then(response => {
        if (response.status === 404) { sponsorCache.set(videoId, { state: 'ready', rows: [] }); return; }
        if (response.status !== 200) throw new Error('SponsorBlock unavailable');
        const rows = JSON.parse(response.responseText || '[]');
        sponsorCache.set(videoId, { state: 'ready', rows: Array.isArray(rows) ? rows.slice(0, 100) : [] });
      })
      .catch(() => sponsorCache.set(videoId, { state: 'error' }));
  }

  return [
    { id: 'youtube-shorts', site: 'youtube', label: 'Masquer les Shorts dans les listes', defaultOn: true,
      run(ctx) {
        // An intentionally opened Short remains usable. Ordinary shelves are never hidden wholesale.
        if (/^\/shorts(?:\/|$)/.test(ctx.location.pathname)) return;
        ctx.all('ytd-reel-shelf-renderer,ytm-reel-shelf-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,yt-shorts-lockup-view-model')
          .forEach(el => ctx.hide(el));
        for (const card of ctx.all('ytd-rich-item-renderer,ytm-rich-item-renderer,ytd-video-renderer,ytm-video-with-context-renderer')) {
          const links = [...card.querySelectorAll('a[href]')].map(a => ctx.safeHttp(a.getAttribute('href'))).filter(Boolean);
          const local = links.filter(url => ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname));
          if (local.some(url => url.pathname.startsWith('/shorts/')) && !local.some(url => url.pathname === '/watch')) ctx.hide(card);
        }
      } },
    { id: 'youtube-community-posts', site: 'youtube', label: 'Masquer les publications communautaires', defaultOn: true,
      run(ctx) {
        // A community tab or an individual post opened deliberately remains usable.
        if (/^\/post(?:\/|$)/.test(ctx.location.pathname) || /\/(?:community|posts)(?:\/|$)/.test(ctx.location.pathname)) return;
        const posts = ctx.all([
          'ytd-post-renderer', 'ytd-backstage-post-thread-renderer', 'ytd-backstage-post-renderer',
          'ytm-post-renderer', 'ytm-backstage-post-thread-renderer', 'ytm-backstage-post-renderer',
          'ytd-rich-section-renderer[is-post]', 'ytm-rich-section-renderer[is-post]'
        ].join(','));
        for (const post of posts) {
          ctx.hide(post.closest('ytd-rich-section-renderer,ytm-rich-section-renderer,ytd-rich-item-renderer,ytm-rich-item-renderer') || post);
        }
        // Fallback for new YouTube renderers: /post/ is specific to community posts.
        for (const link of ctx.all('a[href^="/post/"]')) {
          const card = link.closest('ytd-rich-section-renderer,ytm-rich-section-renderer,ytd-rich-item-renderer,ytm-rich-item-renderer,ytd-post-renderer,ytm-post-renderer');
          if (card) ctx.hide(card);
        }
      } },
    { id: 'youtube-sponsorblock', site: 'youtube', label: 'Afficher les segments SponsorBlock (envoie seulement l’identifiant vidéo)', defaultOn: false,
      run: sponsorSegments }
  ];
}

// Source: src/sites/reddit.js
function redditSiteModules() {
  return [
    { id: 'reddit-app-prompts', site: 'reddit', label: 'Masquer les invitations à ouvrir l’application', defaultOn: true,
      run(ctx) {
        const selectors = '[data-testid="xpromo-modal"],.XPromoPopup,.xpromo-popup,shreddit-async-loader[bundlename*="xpromo" i],[role="dialog"],faceplate-dialog';
        for (const box of ctx.all(selectors)) {
          // Real login/signup forms, text editors and native modal dialogs are deliberately left alone.
          if (box.matches('dialog[open]') || box.querySelector('form,input,textarea,[contenteditable],dialog[open]')) continue;
          const text = box.textContent.replace(/\s+/g, ' ').trim();
          if (text.length > 2500) continue;
          const prompt = /open in (?:the )?app|continue in (?:the )?app|ouvrir dans l[’'](?:app|application)|continuer dans l[’']application/i.test(text);
          const appLink = [...box.querySelectorAll('a[href]')].some(a => {
            const raw = a.getAttribute('href') || '';
            if (/^reddit:\/\//i.test(raw)) return true;
            const url = ctx.safeHttp(raw);
            return url && (url.hostname === 'reddit.app.link' || url.hostname === 'apps.apple.com' || url.hostname === 'play.google.com');
          });
          if (prompt && appLink) ctx.hide(box);
        }
        // No unconditional scroll unlocking: do not interfere with other dialogs or the consent UI.
      } }
  ];
}

// Source: src/sites/app.js
function startSitesApp(GM) {
  if (!sitesRoute(location.hostname, location.pathname)) return null;
  const modules = [...amazonSiteModules(), ...googleSiteModules(), ...youtubeSiteModules(GM), ...redditSiteModules()];
  const key = 'wa-sites:settings:v1';
  const defaults = Object.fromEntries(modules.map(module => [module.id, module.defaultOn]));
  let settings = { ...defaults };
  let ready = false, allowed = false, paused = false, stopped = false, suspended = false;
  let timer = null, notice = 'Chargement des préférences…', writeQueue = Promise.resolve();
  let currentSite = sitesRoute(location.hostname, location.pathname);
  const effects = createSitesEffects(document);
  const host = document.createElement('div');
  host.id = 'wa-sites-ios-host'; host.dataset.waUi = '1';
  host.style.cssText = 'all:initial;position:fixed;left:12px;bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:2147483646;max-width:calc(100vw - 24px)';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host{color-scheme:light}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}
    button:focus-visible,input:focus-visible{outline:3px solid #f59e0b;outline-offset:3px}
    .launcher{border:0;border-radius:999px;background:#0f766e;color:white;padding:13px 17px;font:700 15px system-ui;box-shadow:0 4px 15px #0005;min-height:44px}
    .panel{background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:16px;padding:16px;margin-bottom:8px;width:340px;max-width:calc(100vw - 24px);max-height:65vh;overflow:auto;box-shadow:0 8px 32px #0004;font:15px/1.45 system-ui}
    [hidden]{display:none!important}header{display:flex;align-items:center;justify-content:space-between;gap:10px}h2{font-size:18px;margin:0}p{margin:10px 0}
    .close{border:0;background:transparent;font-size:24px;min-width:44px;min-height:44px}
    label{display:flex;align-items:flex-start;gap:10px;border-top:1px solid #e2e8f0;padding:12px 0}input{margin-top:4px;min-width:20px;min-height:20px;accent-color:#0f766e}label span{flex:1}small{display:block;color:#475569;font-size:12px}
    .action{display:block;width:100%;padding:12px;border:1px solid #0f766e;border-radius:10px;background:#f0fdfa;color:#134e4a;margin:10px 0;min-height:44px}
    .status{font-size:13px;color:#475569}
  </style><section class="panel" hidden aria-label="Réglages WA Sites">
    <header><h2>WA Sites · 0.2.0</h2><button class="close" aria-label="Fermer">×</button></header>
    <p class="site"></p><div class="modules"></div>
    <button class="action compare">Voir l’original — pause</button>
    <button class="action temporary" hidden>Activer pour cette page seulement</button>
    <p class="status" role="status" aria-live="polite"></p>
    <small>Filtres locaux, sans token. SponsorBlock est facultatif et n’envoie que l’identifiant de la vidéo à sponsor.ajay.app.</small>
  </section><button class="launcher" aria-expanded="false" aria-label="Ouvrir WA Sites">Sites</button>`;
  document.body.appendChild(host);
  const pageStyle = document.createElement('style'); pageStyle.dataset.waUi = '1';
  pageStyle.textContent = '[data-wa-sites-hidden="1"]{display:none!important}';
  (document.head || document.documentElement).appendChild(pageStyle);
  const panel = root.querySelector('.panel'), launcher = root.querySelector('.launcher');
  const list = root.querySelector('.modules'), compare = root.querySelector('.compare');
  const temporary = root.querySelector('.temporary'), status = root.querySelector('.status');
  const inputs = new Map();
  const siteNames = { amazon: 'Amazon', google: 'Google', youtube: 'YouTube', reddit: 'Reddit' };
  const observer = new MutationObserver(() => schedule());
  const clearEffects = () => modules.forEach(module => effects.clear(module.id));
  function observe() {
    if (!stopped && !suspended && !document.hidden && !paused && allowed) observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['href', 'class', 'id', 'hidden', 'data-component-type', 'data-testid', 'data-cel-widget', 'data-ad-details', 'data-adfeedbackdetails']
    });
  }
  function render() {
    host.style.display = currentSite ? 'block' : 'none';
    root.querySelector('.site').textContent = `${siteNames[currentSite] || 'Page exclue'} — améliorations automatiques`;
    for (const module of modules) {
      const row = inputs.get(module.id);
      row.label.hidden = module.site !== currentSite;
      row.input.checked = settings[module.id]; row.input.disabled = !ready;
      const count = effects.count(module.id);
      row.count.textContent = count ? `${count} élément(s) modifié(s)` : 'Aucun élément modifié sur cette page';
    }
    compare.textContent = paused ? 'Réactiver le nettoyage' : 'Voir l’original — pause';
    compare.disabled = !allowed;
    temporary.hidden = !ready || allowed;
    status.textContent = notice || (paused ? 'Pause : les changements de WA Sites sont annulés.' : 'Actif. Tu peux désactiver chaque fonction ou comparer avec l’original.');
  }
  function run() {
    if (stopped) return;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    observer.disconnect();
    clearEffects();
    currentSite = sitesRoute(location.hostname, location.pathname);
    if (ready && allowed && !paused && !suspended && !document.hidden && currentSite) {
      for (const module of modules) {
        if (module.site !== currentSite || !settings[module.id]) continue;
        try {
          const pending = module.run(createSitesContext(document, location, effects, module.id));
          if (pending && typeof pending.then === 'function') pending.then(() => schedule());
        }
        catch { effects.clear(module.id); notice = 'Une fonction a été ignorée sur cette page. Les autres restent disponibles.'; }
      }
    }
    effects.prune(); render(); observe();
  }
  function schedule() {
    if (stopped || suspended || document.hidden || timer !== null) return;
    timer = setTimeout(run, 150);
  }
  function save() {
    const snapshot = { version: 1, modules: { ...settings } };
    writeQueue = writeQueue.then(async () => {
      if (!GM || typeof GM.setValue !== 'function') throw new Error('storage unavailable');
      await GM.setValue(key, snapshot);
    }).catch(() => {
      notice = 'Réglage appliqué ici, mais non enregistré. Vérifie l’autorisation de stockage de Userscripts.'; render();
    });
  }
  for (const module of modules) {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.module = module.id;
    const span = document.createElement('span'); span.textContent = module.label;
    const count = document.createElement('small'); span.appendChild(count);
    label.append(input, span); list.appendChild(label); inputs.set(module.id, { label, input, count });
    input.addEventListener('change', () => { settings[module.id] = input.checked; notice = ''; run(); save(); });
  }
  function togglePanel(open) {
    panel.hidden = !open; launcher.setAttribute('aria-expanded', String(open));
    if (!open) launcher.focus();
  }
  launcher.addEventListener('click', () => togglePanel(panel.hidden));
  root.querySelector('.close').addEventListener('click', () => togglePanel(false));
  root.addEventListener('keydown', event => { if (event.key === 'Escape') togglePanel(false); });
  compare.addEventListener('click', () => { paused = !paused; notice = ''; run(); });
  temporary.addEventListener('click', () => { allowed = true; notice = 'Mode temporaire : aucun réglage ne sera garanti après rechargement.'; run(); });
  const listeners = [];
  function listen(target, type, handler) { target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler)); }
  for (const type of ['popstate', 'hashchange', 'yt-navigate-finish']) listen(window, type, schedule);
  listen(document, 'visibilitychange', () => { if (document.hidden) { observer.disconnect(); if (timer !== null) clearTimeout(timer); timer = null; } else run(); });
  listen(window, 'pagehide', () => { suspended = true; observer.disconnect(); if (timer !== null) clearTimeout(timer); timer = null; });
  listen(window, 'pageshow', () => { suspended = false; run(); });
  render();
  const loaded = (async () => {
    try {
      if (!GM || typeof GM.getValue !== 'function' || typeof GM.setValue !== 'function') throw new Error('storage unavailable');
      const saved = await GM.getValue(key, null);
      if (saved !== null && saved !== undefined) {
        if (!saved || saved.version !== 1 || !saved.modules || typeof saved.modules !== 'object' || Array.isArray(saved.modules)) throw new Error('invalid preferences');
        for (const module of modules) {
          const value = saved.modules[module.id];
          if (value !== undefined && typeof value !== 'boolean') throw new Error('invalid preference');
          if (typeof value === 'boolean') settings[module.id] = value;
        }
      }
      allowed = true; notice = '';
    } catch {
      notice = 'Préférences indisponibles : nettoyage en pause. Tu peux l’activer temporairement ci-dessous.';
    } finally { ready = true; run(); }
  })();
  return {
    ready: loaded, run,
    stop() { stopped = true; observer.disconnect(); if (timer !== null) clearTimeout(timer); listeners.forEach(remove => remove()); clearEffects(); pageStyle.remove(); host.remove(); }
  };
}

  startSitesApp(sitesGM);
})();
