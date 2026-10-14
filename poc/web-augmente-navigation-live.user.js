// ==UserScript==
// @name         Web Augmenté - Navigation Live POC
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.2.0
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
  const MAX_FIELD_SUMMARY_CHARS = 2400;
  const SENSITIVE_FIELD = /(?:passw|secret|token|api.?key|credit|card.?number|cvv|cvc|iban|ssn|social.?security|birth|address|adresse|email|e-mail|phone|telephone|téléphone|mobile|otp|2fa|verification|vérification|security.?code)/i;
  const USERNAME_FIELD = /(?:^|[^a-z])(?:username|user.name|pseudo|handle|nom.d.utilisateur)(?:$|[^a-z])/i;

  if (!document.body || !/^https?:$/.test(location.protocol) ||
      location.hostname === 'web-augmente-api.osmanjulien-arch.workers.dev') return;

  // Les valeurs GM sont stockées par l'extension Userscripts, pas dans le localStorage du site.
  let enabled = Boolean(await GM.getValue(KEY_ENABLED, false));
  let token = String(await GM.getValue(KEY_TOKEN, '') || '');
  let sending = false;
  let lastSuccessfulSignature = '';
  let error = false;
  // Le mode lecture des champs est désactivé à chaque nouvelle page.
  let fieldsEnabled = false;

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

  const fieldsButton = document.createElement('button');
  fieldsButton.type = 'button';
  fieldsButton.setAttribute('aria-label', 'Activer ou arrêter la lecture des pseudonymes');
  fieldsButton.style.cssText = [
    'position:fixed', 'right:12px', 'bottom:66px', 'z-index:2147483647',
    'padding:9px 13px', 'border-radius:22px', 'border:1px solid #777',
    'background:#1c1c1e', 'color:#fff', 'font:600 12px system-ui',
    'box-shadow:0 2px 12px #0005', 'cursor:pointer'
  ].join(';');
  document.body.appendChild(fieldsButton);

  function paint() {
    button.textContent = error ? 'WA Live : erreur' : (enabled ? 'WA Live : ON' : 'WA Live : OFF');
    button.style.opacity = sending ? '0.65' : '1';
    fieldsButton.textContent = fieldsEnabled ? 'WA Champs : ON' : 'WA Champs : OFF';
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

  // La lecture des valeurs reste limitée aux pseudonymes explicitement identifiés.
  // Aucun mot de passe, email, numéro ou texte libre n'est transmis par l'inspecteur.
  function inspectFields() {
    if (!fieldsEnabled) return '';
    if (document.querySelector('input[type="password"]')) {
      return 'Inspection suspendue : formulaire avec mot de passe.';
    }
    const controls = Array.from(document.querySelectorAll('input, textarea, select')).slice(0, 25);
    const summary = [];
    for (const field of controls) {
      if (field.disabled || field.type === 'hidden') continue;
      const type = String(field.type || '').toLowerCase();
      if (!['text', 'email', 'tel', 'number', 'search', 'url', 'textarea', 'select-one'].includes(type)) continue;
      const label = String(
        field.labels?.[0]?.innerText || field.getAttribute('aria-label') ||
        field.getAttribute('placeholder') || field.name || field.id || 'Sans libellé'
      ).replace(/[\r\n]+/g, ' ').slice(0, 70);
      const hints = [field.name, field.id, field.getAttribute('autocomplete'), label].join(' ');
      const sensitive = type !== 'text' || SENSITIVE_FIELD.test(hints);
      const safeUsername = !sensitive && USERNAME_FIELD.test(hints);
      const value = safeUsername ? String(field.value || '').slice(0, 64) : '';
      const shareable = value && !value.includes('@') && !/\d{6,}/.test(value);
      summary.push('- ' + label + ': ' + (shareable ? JSON.stringify(value) : '[valeur masquée]'));
    }
    if (!summary.length) return 'Inspection activée : aucun champ texte admissible.';
    return ('Champs (autorisation limitée à cette page)\n' +
      summary.join('\n')).slice(0, MAX_FIELD_SUMMARY_CHARS);
  }

  function snapshot() {
    const url = safeUrl();
    const inspected = inspectFields();
    const content = String(document.body.innerText || '')
      .replace(button.textContent, '')
      .replace(fieldsButton.textContent, '')
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, MAX_CHARS - inspected.length - 2) +
      (inspected ? '\n\n' + inspected : '');
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

  fieldsButton.addEventListener('click', () => {
    if (!enabled && !fieldsEnabled) {
      window.alert('Active d’abord WA Live pour partager les champs autorisés.');
      return;
    }
    fieldsEnabled = !fieldsEnabled;
    paint();
    if (enabled) void publishIfChanged();
  });

  paint();
  // Polling : la première page puis chaque changement visible (y compris SPA).
  // L'iPhone peut suspendre les scripts d'un onglet en arrière-plan.
  if (enabled) void publishIfChanged();
  setInterval(() => void publishIfChanged(), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => void publishIfChanged());
  window.addEventListener('pageshow', () => void publishIfChanged());
})();
