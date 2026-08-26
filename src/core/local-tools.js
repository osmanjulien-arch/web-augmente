// Local registry only. No remote JavaScript, eval, polling, or MCP dispatch.
function installLocalTools({ panel, shadow, getStored, setStored, setStatus, togglePanel }) {
  const root = panel.querySelector('#wa-local-tools');
  const modules = [createToolboxModule(), createCopyModule(), createFeedsModule(), createSourceModule(), createNotesModule()];
  const instances = new Map();
  const controls = new Map();
  const preferenceKey = 'wa-core:local-modules:v1';
  let disabled = new Set(), preferencesAvailable = false, updating = false;
  const css = document.createElement('style');
  css.textContent = `
    details { margin: 10px 0; border: 1px solid #d1d5db; border-radius: 10px; padding: 8px; }
    summary { cursor: pointer; font-weight: 700; padding: 7px 0; }
    .wa-local-description, .wa-local-warning { font-size: 12px; color: #4b5563; }
    .wa-local-action, .wa-local-link { display: block; width: 100%; padding: 11px; margin: 5px 0;
      border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #111827;
      text-align: left; text-decoration: none; overflow-wrap: anywhere; }
    .wa-local-action:disabled { opacity: .55; }
    .wa-local-output { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
    #wa-local-tools textarea { width: 100%; font-size: 16px; color: #111827; background: #fff;
      padding: 8px; border: 1px solid #94a3b8; border-radius: 8px; }
    .wa-module-toggle { display: flex; gap: 10px; align-items: center; min-height: 44px; }
  `;
  shadow.appendChild(css);
  const heading = document.createElement('h2'); heading.textContent = 'Mes outils Safari';
  const warning = document.createElement('p'); warning.className = 'wa-local-warning';
  warning.textContent = 'Outils locaux : rien n’est envoyé à Cloudflare.';
  const settings = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Afficher / masquer mes modules';
  settings.appendChild(summary);
  root.append(heading, warning, settings);

  function safeUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
      const url = new URL(raw, location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch { return null; }
  }

  function pageUrl() {
    const safe = safeUrl(location.href);
    if (!safe) throw new Error('Adresse de page non prise en charge.');
    const url = new URL(safe);
    // Conservative: keep semantic parameters and hash routes; never change the page URL.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  }

  function mount(module) {
    if (instances.has(module.id)) return;
    const section = document.createElement('details');
    section.dataset.waModule = module.id;
    const title = document.createElement('summary'); title.textContent = module.title;
    const description = document.createElement('p'); description.className = 'wa-local-description';
    description.textContent = module.description;
    const area = document.createElement('div');
    const output = document.createElement('div'); output.className = 'wa-local-output';
    section.append(title, description, area, output); root.appendChild(section);
    const instance = { section, active: true, busy: false };
    instances.set(module.id, instance);
    const action = (label, handler) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wa-local-action'; b.textContent = label;
      b.addEventListener('click', async () => {
        if (!instance.active || instance.busy) return;
        instance.busy = true;
        area.querySelectorAll('button').forEach(el => { el.disabled = true; });
        try { await handler(); }
        catch (error) { setStatus(error instanceof Error ? error.message : 'Outil local indisponible.', 'error'); }
        finally {
          instance.busy = false;
          area.querySelectorAll('button').forEach(el => { el.disabled = false; });
        }
      });
      area.appendChild(b); return b;
    };
    const copyText = async text => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
        await navigator.clipboard.writeText(text);
        setStatus('Copié dans le presse-papiers. Aucun envoi réseau.', 'success');
      } catch {
        output.replaceChildren();
        const label = document.createElement('p'); label.textContent = 'Copie automatique indisponible : sélectionne et copie ce texte.';
        const field = document.createElement('textarea'); field.readOnly = true; field.value = text;
        field.setAttribute('aria-label', 'Texte à copier manuellement');
        output.append(label, field); field.focus(); field.select();
        setStatus('Texte prêt pour une copie manuelle. Aucun envoi réseau.');
      }
    };
    try {
      module.mount({ area, output, action, safeUrl, pageUrl, copyText,
        read: getStored, write: setStored, status: setStatus, close: () => togglePanel(false) });
    } catch {
      module.stop?.(); instance.active = false;
      area.replaceChildren(); output.textContent = 'Module indisponible ; les autres fonctions restent utilisables.';
    }
  }

  function unmount(module) {
    const instance = instances.get(module.id);
    if (!instance) return;
    instance.active = false; module.stop?.(); instance.section.remove(); instances.delete(module.id);
  }

  for (const module of modules) {
    const label = document.createElement('label'); label.className = 'wa-module-toggle';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.disabled = true;
    input.setAttribute('aria-label', `Afficher ${module.title}`);
    const text = document.createElement('span'); text.textContent = module.title;
    label.append(input, text); settings.appendChild(label); controls.set(module.id, input);
    mount(module);
    input.addEventListener('change', async () => {
      const wasEnabled = !disabled.has(module.id);
      if (updating || instances.get(module.id)?.busy) { input.checked = wasEnabled; return; }
      if (!input.checked && module.canDisable && !module.canDisable()) { input.checked = true; return; }
      const next = new Set(disabled);
      if (input.checked) next.delete(module.id); else next.add(module.id);
      updating = true;
      controls.forEach(el => { el.disabled = true; });
      try {
        if (!preferencesAvailable) throw new Error('Stockage Userscripts indisponible : réglage non enregistré.');
        await setStored(preferenceKey, JSON.stringify({ version: 1, disabled: [...next] }));
        disabled = next;
        if (disabled.has(module.id)) unmount(module); else mount(module);
      } catch {
        input.checked = wasEnabled;
        setStatus('Réglage non enregistré. Le module et la connexion existants sont conservés.', 'error');
      } finally {
        updating = false; controls.forEach(el => { el.disabled = !preferencesAvailable; });
      }
    });
  }

  // Storage read only; no API call, token prompt, observer or site-wide DOM scan at startup.
  const ready = (async () => {
    try {
      const raw = await getStored(preferenceKey, '');
      if (raw) {
        const value = JSON.parse(raw);
        if (value?.version !== 1 || !Array.isArray(value.disabled) || value.disabled.some(id => typeof id !== 'string')) {
          throw new Error('invalid-preferences');
        }
        disabled = new Set(value.disabled.filter(id => controls.has(id)));
      }
      preferencesAvailable = true;
      for (const module of modules) {
        const input = controls.get(module.id); input.disabled = false; input.checked = !disabled.has(module.id);
        if (disabled.has(module.id)) unmount(module);
      }
    } catch {
      warning.textContent = 'Réglages des modules non chargés : outils affichés par défaut, personnalisation indisponible. Connexion et token inchangés.';
    }
  })();
  return { ready };
}
