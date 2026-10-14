// ==UserScript==
// @name         Web Augmenté - Computer Use Assisté POC (désactivé par défaut)
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Test isolé : reçoit une commande distante et demande l'accord avant chaque action.
// @match        https://huggingface.co/*
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
  // Configurer uniquement pour un Worker de TEST séparé, jamais celui en production.
  const CONTROL_ENDPOINT = ''; // Exemple : https://wa-control-poc.<compte>.workers.dev
  const TOKEN_KEY = 'wa_control_device_token_poc';
  const ORIGIN_ALLOWLIST = new Set(['https://huggingface.co']);
  const POLL_INTERVAL_MS = 3500;
  const SAFE_FIELD = /(?:^|[^a-z])(?:username|user.name|pseudo|handle|nom.d.utilisateur)(?:$|[^a-z])/i;
  const SENSITIVE_FIELD = /passw|secret|token|api.?key|credit|card|iban|email|e-mail|phone|tel|address|adresse|otp|2fa|birth|search history/i;
  if (!document.body || !ORIGIN_ALLOWLIST.has(location.origin)) return;

  let enabled = false; // Toujours OFF au chargement, même si le jeton a été conservé.
  let token = String(await GM.getValue(TOKEN_KEY, '') || '');
  let activeSession = '';
  let authorizedPage = '';
  let polling = false;
  let lastHandledId = '';
  let lastOutcome = '';
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Contrôle assisté Web Augmenté : marche ou arrêt');
  button.style.cssText = [
    'position:fixed', 'bottom:112px', 'right:12px', 'z-index:2147483647',
    'border:1px solid #666', 'border-radius:20px', 'padding:10px 12px',
    'color:#fff', 'background:#222', 'font:600 12px system-ui',
    'box-shadow:0 2px 12px #0005'
  ].join(';');
  document.body.appendChild(button);

  function paint() {
    button.textContent = enabled ? 'WA Ctrl : ON' : 'WA Ctrl : OFF';
    button.style.background = enabled ? '#14532d' : '#222';
    button.title = lastOutcome;
  }
  function shutOff(reason) {
    enabled = false;
    activeSession = '';
    authorizedPage = '';
    lastOutcome = reason || '';
    paint();
  }
  function randomSession() {
    const values = new Uint8Array(24);
    crypto.getRandomValues(values);
    return Array.from(values, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function request(method, path, data) {
    return GM.xmlHttpRequest({
      method, url: CONTROL_ENDPOINT.replace(/\/$/, '') + path,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      ...(data ? { data: JSON.stringify(data) } : {}),
      timeout: 10000
    });
  }
  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.isConnected || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden';
  }
  function elementSummary(element) {
    const label = String(
      element.getAttribute('aria-label') || element.labels?.[0]?.innerText ||
      element.innerText || element.getAttribute('placeholder') ||
      element.getAttribute('name') || element.id || element.tagName
    ).replace(/\s+/g, ' ').trim().slice(0, 90);
    return label || element.tagName.toLowerCase();
  }
  function resolveAction(job) {
    if (!job || job.sessionId !== activeSession || job.origin !== location.origin ||
        !['fill', 'click'].includes(job.type) ||
        typeof job.selector !== 'string' ||
        job.selector.length > 180 ||
        /[{};\r\n]/.test(job.selector) ||
        Date.now() >= job.expiresAt) return null;
    let element;
    try { element = document.querySelector(job.selector); } catch { return null; }
    if (!element || !isVisible(element) || element.disabled ||
        element.closest('input[type="password"]') || element === button) return null;
    if (job.type === 'fill') {
      if (!(element instanceof HTMLInputElement) ||
          element.type !== 'text' ||
          element.readOnly ||
          typeof job.value !== 'string' ||
          !/^[A-Za-z0-9._-]{1,40}$/.test(job.value)) return null;
      const hints = [element.name, element.id,
        element.autocomplete, element.getAttribute('aria-label'),
        element.getAttribute('placeholder'), element.labels?.[0]?.innerText].join(' ');
      if (!SAFE_FIELD.test(hints) || SENSITIVE_FIELD.test(hints)) return null;
      if (element.form && element.form.querySelector('input[type="password"]')) return null;
    } else {
      const safeLink = element instanceof HTMLAnchorElement &&
        element.href && new URL(element.href).origin === location.origin &&
        !element.hasAttribute('download') &&
        !/(?:logout|signout|delete|remove|billing|payment|admin)/i.test(element.pathname);
      const safeButton = element instanceof HTMLButtonElement &&
        element.type === 'button' && !element.form &&
        !/(?:delete|remove|logout|buy|pay|purchase|subscribe)/i.test(elementSummary(element));
      if (!safeLink && !safeButton) return null;
    }
    return element;
  }

  async function report(job, status) {
    const response = await request('POST', '/control/result', {
      sessionId: activeSession, id: job.id, status
    });
    if (response.status !== 200) {
      lastOutcome = 'Résultat non transmis (HTTP ' + response.status + ')';
      paint();
    }
  }

  async function process(job) {
    if (!job || job.id === lastHandledId) return;
    const element = resolveAction(job);
    // Marquer la commande avant de demander confirmation pour éviter une répétition.
    lastHandledId = job.id;
    if (!element) {
      await report(job, 'rejected');
      return;
    }
    const summary = elementSummary(element);
    const actionDescription = job.type === 'fill'
      ? 'SAISIR ' + JSON.stringify(job.value) + ' dans : ' + summary
      : 'CLIQUER sur : ' + summary;
    const accepted = window.confirm(
      'WEB AUGMENTÉ — DEMANDE DE CONTRÔLE\n\n' +
      'Site : ' + location.origin + '\n' + actionDescription + '\n\n' +
      'Action ponctuelle. Refuser annule cette commande.\nAutoriser ?'
    );
    if (!accepted || !enabled || location.href !== authorizedPage) {
      await report(job, 'rejected');
      return;
    }
    try {
      if (job.type === 'fill') {
        element.focus();
        // Setter natif pour compatibilité avec les formulaires à état.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(element, job.value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Un clic peut déclencher une navigation; reporter avant d'exécuter.
        await report(job, 'approved');
        element.click();
        return;
      }
      await report(job, 'approved');
      lastOutcome = 'Action autorisée, exécutée';
    } catch {
      lastOutcome = 'Action échouée';
      try { await report(job, 'error'); } catch {}
    }
    paint();
  }

  async function poll() {
    if (!enabled || polling || document.visibilityState === 'hidden') return;
    if (location.href !== authorizedPage) {
      shutOff('Navigation détectée : contrôle désactivé');
      return;
    }
    polling = true;
    try {
      const qs = new URLSearchParams({ sessionId: activeSession, origin: location.origin });
      const response = await request('GET', '/control/next?' + qs.toString());
      if (response.status === 401) {
        shutOff('Jeton refusé');
      } else if (response.status === 200) {
        const payload = JSON.parse(response.responseText);
        if (enabled && payload.action) await process(payload.action);
      } else {
        lastOutcome = 'Erreur de liaison HTTP ' + response.status;
        paint();
      }
    } catch {
      lastOutcome = 'Worker inaccessible';
      paint();
    } finally {
      polling = false;
    }
  }

  button.addEventListener('click', async () => {
    if (enabled) { shutOff('Arrêt manuel'); return; }
    if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev\/?$/i.test(CONTROL_ENDPOINT)) {
      window.alert('POC non configuré : installer un Worker de test distinct et renseigner CONTROL_ENDPOINT.');
      return;
    }
    if (!token) {
      const candidate = window.prompt(
        'Jeton DEVICE_TOKEN du Worker de test (ne jamais le coller dans ChatGPT/GitHub) :'
      );
      if (!candidate || candidate.trim().length < 24) return;
      token = candidate.trim();
      await GM.setValue(TOKEN_KEY, token);
    }
    activeSession = randomSession();
    authorizedPage = location.href;
    lastHandledId = '';
    lastOutcome = 'Autorisation limitée à cette page';
    enabled = true;
    paint();
    window.prompt('Copie cet identifiant de session pour adresser une commande. ' +
      'Ne partage jamais ton jeton :', activeSession);
    void poll();
  });

  paint();
  setInterval(() => void poll(), POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => void poll());
  window.addEventListener('pagehide', () => shutOff('Onglet quitté'));
})();
