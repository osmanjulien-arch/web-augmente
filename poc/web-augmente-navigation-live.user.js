// ==UserScript==
// @name         Web Augmenté - Navigation Live POC
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Partage volontairement le contenu de l'onglet actif avec le MCP Web Augmenté.
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @inject-into  content
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(async () => {
  'use strict';

  // Réutilise le POST existant du Worker : aucune modification du MCP nécessaire.
  const ENDPOINT = 'https://web-augmente-api.osmanjulien-arch.workers.dev/api/wa';
  const KEY_ENABLED = 'wa_live_enabled_v1';
  const KEY_TOKEN = 'wa_live_api_token_v1';
  const CHECK_INTERVAL_MS = 2000;
  const MAX_CHARS = 32000;

  if (!document.body || !/^https?:$/.test(location.protocol) ||
      location.hostname === 'web-augmente-api.osmanjulien-arch.workers.dev') return;

  // Les valeurs GM sont stockées par l'extension Userscripts, pas dans le localStorage du site.
  let enabled = Boolean(await GM.getValue(KEY_ENABLED, false));
  let token = String(await GM.getValue(KEY_TOKEN, '') || '');
  let sending = false;
  let lastSuccessfulSignature = '';
  let error = false;

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Activer ou arrêter le partage Web Augmenté');
  button.style.cssText = [
    'position:fixed', 'right:12px', 'bottom:16px', 'z-index:2147483647',
    'padding:10px 14px', 'border-radius:22px', 'border:1px solid #777',
    'background:#1c1c1e', 'color:#fff', 'font:600 13px system-ui',
    'box-shadow:0 2px 12px #0005', 'cursor:pointer'
  ].join(';');
  document.body.appendChild(button);

  function paint() {
    button.textContent = error ? 'WA Live : erreur' : (enabled ? 'WA Live : ON' : 'WA Live : OFF');
    button.style.opacity = sending ? '0.65' : '1';
  }

  // Supprime requêtes et fragments d'URL pour ne pas partager de paramètres sensibles.
  function safeUrl() {
    const url = new URL(location.href);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  }

  function snapshot() {
    const url = safeUrl();
    const label = button.textContent;
    const content = String(document.body.innerText || '')
      .replace(label, '')
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, MAX_CHARS);
    return {
      url,
      canonical_url: url,
      title: String(document.title || '').slice(0, 500),
      content,
      capture_type: 'page',
      captured_at: new Date().toISOString(),
      client_version: 'wa-live-poc-0.1.0'
    };
  }

  async function publishIfChanged() {
    if (!enabled || !token || sending || document.visibilityState === 'hidden') return;
    const page = snapshot();
    if (!page.content) return;
    const signature = [page.url, page.title, page.content].join('\n');
    if (signature === lastSuccessfulSignature) return;
    sending = true;
    paint();
    try {
      const response = await GM.xmlHttpRequest({
        method: 'POST',
        url: ENDPOINT,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({ action: 'remember_page', page }),
        timeout: 10000
      });
      if (response.status === 200) {
        lastSuccessfulSignature = signature;
        error = false;
      } else if (response.status === 401) {
        // En cas d'échec d'authentification, interrompre le partage.
        enabled = false;
        token = '';
        await GM.setValue(KEY_ENABLED, false);
        await GM.deleteValue(KEY_TOKEN);
        error = true;
      } else {
        error = true;
      }
    } catch {
      error = true;
    } finally {
      sending = false;
      paint();
    }
  }

  button.addEventListener('click', async () => {
    if (enabled) {
      enabled = false;
      await GM.setValue(KEY_ENABLED, false);
      error = false;
      paint();
      return;
    }
    if (!token) {
      const entry = window.prompt(
        'Colle ton jeton WA_API_TOKEN ici (jamais dans GitHub ni dans ChatGPT) :'
      );
      if (!entry || entry.trim().length < 20) return;
      token = entry.trim();
      await GM.setValue(KEY_TOKEN, token);
    }
    enabled = true;
    error = false;
    await GM.setValue(KEY_ENABLED, true);
    paint();
    void publishIfChanged();
  });

  paint();
  // Polling : la première page puis chaque changement visible (y compris SPA).
  // L'iPhone peut suspendre les scripts d'un onglet en arrière-plan.
  if (enabled) void publishIfChanged();
  setInterval(() => void publishIfChanged(), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => void publishIfChanged());
  window.addEventListener('pageshow', () => void publishIfChanged());
})();
