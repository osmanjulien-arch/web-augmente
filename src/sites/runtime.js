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
