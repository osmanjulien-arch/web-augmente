// ==UserScript==
// @name         Web Augmenté — WA Core iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.2.0
// @description  Outils locaux modulaires, notes et capture volontaire vers la mémoire Web Augmenté.
// @match        http://*/*
// @match        https://*/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @inject-into  content
// @updateURL    https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/core/wa-core-ios.user.js
// @downloadURL  https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/core/wa-core-ios.user.js
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  if (document.getElementById('wa-core-ios-host')) return;

  const VERSION = '0.2.0';
  const DEFAULT_ENDPOINT = 'https://web-augmente-api.osmanjulien-arch.workers.dev/api/wa';
  // Userscripts Safari injects GM as a function parameter, not window.GM.
  const userscriptApi = typeof GM !== 'undefined' && GM ? GM : null;
  const STORAGE_KEYS = {
    endpoint: 'wa-core:endpoint',
    token: 'wa-core:token'
  };
  const MAX_PAGE_CHARS = 40000;
  const MAX_SELECTION_CHARS = 20000;
  const TRACKING_PARAMS = new Set([
    'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_', 'si',
    'spm', 'yclid', '_ga', '_gl'
  ]);

  const state = {
    busy: false,
    open: false
  };

  function hasModernGM(method) {
    return typeof userscriptApi?.[method] === 'function';
  }

  function requireUserscriptApis() {
    if (!['getValue', 'setValue', 'xmlHttpRequest'].every(hasModernGM)) {
      throw new Error('API Userscripts indisponibles. Mets à jour WA Core dans Userscripts, autorise l’extension sur ce site puis recharge la page. Aucun token ne sera demandé ni stocké dans le site.');
    }
  }

  async function getStored(key, fallback = '') {
    try {
      const value = await userscriptApi.getValue(key, fallback);
      return typeof value === 'string' ? value : fallback;
    } catch {
      throw new Error('Lecture du stockage Userscripts impossible. Le token n’a pas été effacé ; vérifie l’extension puis recharge la page.');
    }
  }

  async function setStored(key, value) {
    try {
      await userscriptApi.setValue(key, value);
      if (await userscriptApi.getValue(key, null) !== value) throw new Error('storage-verification-failed');
    } catch {
      throw new Error('Enregistrement Userscripts non confirmé. Aucun repli vers le stockage du site. Vérifie l’extension avant de réessayer.');
    }
  }

  function normalizeWhitespace(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n[\t ]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cleanUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
          url.searchParams.delete(key);
        }
      }
      url.searchParams.sort();
      return url.toString();
    } catch {
      return location.href;
    }
  }

  function canonicalUrl() {
    const declared = document.querySelector('link[rel~="canonical"][href]')?.href;
    return cleanUrl(declared || location.href);
  }

  function detectSite() {
    const hostname = location.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname.endsWith('amazon.fr')) return location.pathname.startsWith('/gp/video') ? 'Prime Video' : 'Amazon';
    if (hostname.startsWith('google.') || hostname.includes('.google.')) return 'Google';
    if (hostname.endsWith('reddit.com')) return 'Reddit';
    if (hostname.endsWith('youtube.com') || hostname === 'youtu.be') return 'YouTube';
    if (hostname === 'x.com' || hostname.endsWith('twitter.com')) return 'X';
    if (hostname.endsWith('instagram.com')) return 'Instagram';
    return hostname || 'Site courant';
  }

  function pageRoot() {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '#main-content',
      '#main',
      '.main-content'
    ];
    const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).slice(0, 20);
    const useful = candidates
      .map((element) => ({ element, length: normalizeWhitespace(element.textContent).length }))
      .filter(({ length }) => length >= 200)
      .sort((a, b) => b.length - a.length);
    return useful[0]?.element || document.body || document.documentElement;
  }

  function extractUsefulText() {
    const clone = pageRoot().cloneNode(true);
    clone.querySelectorAll([
      'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe',
      'input', 'textarea', 'select', 'option', 'button', 'form',
      '[contenteditable="true"]', '[hidden]', '[aria-hidden="true"]',
      '[data-wa-ui]', 'nav', 'footer', 'aside'
    ].join(',')).forEach((element) => element.remove());

    clone.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
    clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,section').forEach((element) => {
      element.appendChild(document.createTextNode('\n'));
    });

    return normalizeWhitespace(clone.textContent).slice(0, MAX_PAGE_CHARS);
  }

  function extractDescription() {
    return normalizeWhitespace(
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      ''
    ).slice(0, 1000);
  }

  function baseCapture() {
    return {
      url: cleanUrl(location.href),
      canonical_url: canonicalUrl(),
      title: normalizeWhitespace(document.title).slice(0, 500),
      domain: location.hostname.toLowerCase(),
      description: extractDescription(),
      language: (document.documentElement.lang || '').slice(0, 20),
      captured_at: new Date().toISOString(),
      client_version: VERSION
    };
  }

  function capturePage() {
    const content = extractUsefulText();
    if (!content) throw new Error('Aucun texte utile détecté sur cette page.');
    return {
      ...baseCapture(),
      capture_type: 'page',
      content
    };
  }

  function captureSelection() {
    const content = normalizeWhitespace(globalThis.getSelection?.().toString()).slice(0, MAX_SELECTION_CHARS);
    if (!content) throw new Error('Sélectionne d’abord un passage dans la page.');
    return {
      ...baseCapture(),
      capture_type: 'selection',
      content
    };
  }

  function hasVisiblePasswordField() {
    return [...document.querySelectorAll('input[type="password"]')].some((input) => {
      const rect = input.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function mayBeSensitivePage() {
    return /(?:checkout|payment|paiement|bank|banque|account|compte|identity|identite|login|signin|connexion)/i
      .test(`${location.hostname}${location.pathname}`);
  }

  function confirmSafeToSend() {
    if (hasVisiblePasswordField()) {
      throw new Error('Envoi bloqué : un champ mot de passe visible a été détecté.');
    }
    if (mayBeSensitivePage()) {
      return globalThis.confirm(
        'Cette page semble potentiellement sensible. WA exclut les formulaires, mais vérifie le texte avant de continuer. Envoyer quand même ?'
      );
    }
    return true;
  }

  function validateEndpoint(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        throw new Error('HTTPS requis');
      }
      if (url.username || url.password || url.search || url.hash) throw new Error('Adresse sans identifiants ni paramètres requise');
      if (!url.pathname || url.pathname === '/') url.pathname = '/api/wa';
      if (url.pathname !== '/api/wa') throw new Error('Chemin /api/wa requis');
      return url.toString();
    } catch {
      throw new Error('Adresse API invalide. Exemple : https://nom.workers.dev/api/wa');
    }
  }

  async function configureConnection() {
    requireUserscriptApis();
    const currentEndpoint = await getStored(STORAGE_KEYS.endpoint, '');
    const endpointInput = globalThis.prompt(
      'Adresse de l’endpoint Web Augmenté :',
      currentEndpoint || DEFAULT_ENDPOINT
    );
    if (endpointInput === null) return false;

    const endpoint = validateEndpoint(endpointInput);
    const currentToken = await getStored(STORAGE_KEYS.token, '');
    const tokenInput = globalThis.prompt(
      currentToken
        ? 'Nouveau token personnel WA (laisse vide pour conserver le token actuel) :'
        : 'Token personnel WA (il reste dans le stockage du userscript) :',
      ''
    );
    if (tokenInput === null) return false;
    const token = tokenInput.trim() || currentToken;
    if (token.length < 20) throw new Error('Token trop court : utilise au moins 20 caractères aléatoires.');

    await setStored(STORAGE_KEYS.endpoint, endpoint);
    await setStored(STORAGE_KEYS.token, token);
    setStatus(`Configuration enregistrée dans Userscripts pour tous les sites · WA ${VERSION}`, 'success');
    return true;
  }

  async function getConnection(requireToken = true) {
    requireUserscriptApis();
    let endpoint = await getStored(STORAGE_KEYS.endpoint, '') || DEFAULT_ENDPOINT;
    let token = requireToken ? await getStored(STORAGE_KEYS.token, '') : '';
    if (requireToken && !token) {
      const configured = await configureConnection();
      if (!configured) throw new Error('Connexion non configurée.');
      endpoint = await getStored(STORAGE_KEYS.endpoint, '');
      token = await getStored(STORAGE_KEYS.token, '');
    }
    return { endpoint: validateEndpoint(endpoint), token };
  }

  async function requestWithGM(url, options) {
    let response;
    try {
      response = await userscriptApi.xmlHttpRequest({
        url,
        method: options.method,
        headers: options.headers,
        data: options.body,
        responseType: 'text',
        timeout: 20000
      });
    } catch {
      throw new Error('Réseau Userscripts : envoi impossible ou délai dépassé. Vérifie la connexion et les autorisations de l’extension. Le token enregistré est conservé.');
    }
    if (!response || !response.status) {
      throw new Error('Réseau Userscripts : aucune réponse HTTP. Vérifie la connexion et les autorisations de l’extension. Le token enregistré est conservé.');
    }
    if (response.status === 401) {
      throw new Error('Token refusé par le Worker (HTTP 401). Utilise « Configurer la connexion » pour le corriger ; aucune nouvelle saisie automatique.');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Erreur HTTP ${response.status}. Le token enregistré est conservé.`);
    }
    let data;
    try {
      data = JSON.parse(response.responseText);
    } catch {
      throw new Error('Réponse serveur illisible. Vérifie que l’adresse se termine par /api/wa.');
    }
    if (!data || data.ok !== true) throw new Error('Réponse API inattendue : envoi non confirmé.');
    return data;
  }

  async function callApi(action, page, requireToken = true) {
    const { endpoint, token } = await getConnection(requireToken);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, page })
    };

    const result = await requestWithGM(endpoint, options);
    if (result.action !== action) throw new Error('Réponse API inattendue : action non confirmée.');
    return result;
  }

  /* WA_LOCAL_MODULES */

  const host = document.createElement('div');
  host.id = 'wa-core-ios-host';
  host.dataset.waUi = '1';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    #wa-button {
      position: fixed; right: 12px; bottom: calc(82px + env(safe-area-inset-bottom)); z-index: 2147483646;
      width: 52px; height: 52px; border: 0; border-radius: 50%; color: #fff; background: #111827;
      font: 800 15px -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 5px 20px #0006;
    }
    #wa-panel {
      display: none; position: fixed; left: 10px; right: 10px; bottom: calc(144px + env(safe-area-inset-bottom));
      z-index: 2147483647; max-height: min(620px, 70vh); overflow: auto; padding: 16px;
      border: 1px solid #d1d5db; border-radius: 18px; color: #111827; background: #fff;
      font: 15px/1.35 -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 12px 45px #0008;
    }
    #wa-panel.open { display: block; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: 800; }
    .site { margin-top: 2px; color: #6b7280; font-size: 12px; word-break: break-word; }
    .close { width: 34px; height: 34px; border: 0; border-radius: 9px; background: #f3f4f6; font-size: 22px; }
    .action {
      display: block; width: 100%; margin: 8px 0; padding: 13px 14px; border: 1px solid #d1d5db;
      border-radius: 12px; color: #111827; background: #f9fafb; text-align: left; font-weight: 650;
    }
    .action.primary { border-color: #111827; color: #fff; background: #111827; }
    .action:disabled { opacity: .55; }
    #wa-status { min-height: 38px; margin-top: 10px; padding: 10px; border-radius: 10px; background: #f3f4f6; font-size: 13px; }
    #wa-status.success { color: #065f46; background: #ecfdf5; }
    #wa-status.error { color: #991b1b; background: #fef2f2; }
    .privacy { margin: 12px 2px 2px; color: #6b7280; font-size: 11px; }
    #wa-toast {
      display: none; position: fixed; left: 50%; bottom: calc(28px + env(safe-area-inset-bottom)); z-index: 2147483647;
      max-width: 88vw; transform: translateX(-50%); padding: 10px 14px; border-radius: 999px;
      color: #fff; background: #111827; font: 650 13px -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 4px 18px #0007; text-align: center;
    }
    #wa-toast.show { display: block; }
  `;

  const panel = document.createElement('section');
  panel.id = 'wa-panel';
  panel.dataset.waUi = '1';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Web Augmenté');
  panel.innerHTML = `
    <div class="head">
      <div><div class="title">Web Augmenté · ${VERSION}</div><div class="site"></div></div>
      <button class="close" type="button" aria-label="Fermer">×</button>
    </div>
    <div id="wa-local-tools"></div>
    <details><summary>Envoyer vers ma mémoire Web Augmenté</summary>
    <button class="action primary" data-action="send-page" type="button">Envoyer cette page</button>
    <button class="action" data-action="send-selection" type="button">Envoyer la sélection</button>
    <button class="action" data-action="remember" type="button">Mémoriser cette page</button>
    <button class="action" data-action="health" type="button">Tester la connexion</button>
    <button class="action" data-action="configure" type="button">Configurer la connexion</button>
    </details>
    <div id="wa-status" role="status">Prêt. Rien n’est envoyé sans action de ta part.</div>
    <div class="privacy">Texte uniquement · formulaires, mots de passe, scripts, styles et éléments cachés exclus.</div>
  `;
  panel.querySelector('.site').textContent = `${detectSite()} · ${location.hostname}`;

  const button = document.createElement('button');
  button.id = 'wa-button';
  button.dataset.waUi = '1';
  button.type = 'button';
  button.textContent = 'WA';
  button.setAttribute('aria-label', 'Ouvrir Web Augmenté');

  const toast = document.createElement('div');
  toast.id = 'wa-toast';
  toast.dataset.waUi = '1';
  toast.setAttribute('role', 'status');

  shadow.append(style, panel, button, toast);
  document.documentElement.appendChild(host);

  function setStatus(message, kind = '') {
    const status = panel.querySelector('#wa-status');
    status.textContent = message;
    status.className = kind;
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }

  function setBusy(busy) {
    state.busy = busy;
    panel.querySelectorAll('button.action').forEach((item) => { item.disabled = busy; });
  }

  function translateResult(result, characters) {
    const labels = {
      new: 'Nouvelle page mémorisée',
      already_seen: 'Page déjà vue, fiche mise à jour',
      already_analyzed: 'Page déjà analysée, fiche mise à jour',
      changed: 'Changement détecté, nouvelle version mémorisée'
    };
    const label = labels[result.status] || 'Contenu reçu';
    return `${label} · ${characters.toLocaleString('fr-FR')} caractères`;
  }

  async function sendCapture(kind, memoryStatus) {
    if (!confirmSafeToSend()) return;
    const page = kind === 'selection' ? captureSelection() : capturePage();
    page.status = memoryStatus;
    setBusy(true);
    setStatus(`Envoi volontaire en cours · ${page.content.length.toLocaleString('fr-FR')} caractères…`);
    try {
      const result = await callApi('remember_page', page, true);
      const message = translateResult(result, page.content.length);
      setStatus(message, 'success');
      showToast(`Contenu envoyé · ${message}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Échec de l’envoi.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setStatus('Test de connexion…');
    try {
      const result = await callApi('health', undefined, false);
      setStatus(`Serveur joignable via Userscripts · API ${result.version || 'OK'} · ce test public ne valide pas le token`, 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connexion impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function togglePanel(force) {
    state.open = typeof force === 'boolean' ? force : !state.open;
    panel.classList.toggle('open', state.open);
    button.setAttribute('aria-expanded', String(state.open));
  }

  button.addEventListener('click', () => togglePanel());
  panel.querySelector('.close').addEventListener('click', () => togglePanel(false));
  panel.querySelector('[data-action="send-page"]').addEventListener('click', () => sendCapture('page', 'inbox'));
  panel.querySelector('[data-action="send-selection"]').addEventListener('click', () => sendCapture('selection', 'inbox'));
  panel.querySelector('[data-action="remember"]').addEventListener('click', () => sendCapture('page', 'remembered'));
  panel.querySelector('[data-action="health"]').addEventListener('click', testConnection);
  panel.querySelector('[data-action="configure"]').addEventListener('click', async () => {
    try {
      await configureConnection();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Configuration impossible.', 'error');
    }
  });
  installLocalTools({ panel, shadow, getStored, setStored, setStatus, togglePanel });
})();
