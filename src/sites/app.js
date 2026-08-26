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
