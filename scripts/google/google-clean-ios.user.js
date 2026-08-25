// ==UserScript==
// @name         Web Augmenté — Google Clean iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Nettoie les liens de suivi Google et restaure les liens directs sur Google Search.
// @match        https://www.google.*/*
// @match        https://google.*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const TRACKING_PARAMS = new Set([
    'ved','ei','oq','aqs','gs_lcrp','sclient','source','sourceid','uact','cad','sa','biw','bih','dpr','sca_esv','iflsig','client','rlz'
  ]);

  function decodeGoogleRedirect(url) {
    try {
      const u = new URL(url, location.href);
      if (u.hostname.includes('google.') && (u.pathname === '/url' || u.pathname === '/imgres')) {
        const target = u.searchParams.get('q') || u.searchParams.get('url') || u.searchParams.get('imgurl');
        if (target && /^https?:\/\//i.test(target)) return target;
      }
    } catch {}
    return url;
  }

  function stripTracking(url) {
    try {
      const u = new URL(url, location.href);
      for (const key of [...u.searchParams.keys()]) {
        if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) u.searchParams.delete(key);
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  function cleanLink(a) {
    if (!(a instanceof HTMLAnchorElement) || !a.href) return;
    const direct = decodeGoogleRedirect(a.href);
    const cleaned = stripTracking(direct);
    if (cleaned !== a.href) a.href = cleaned;
    a.removeAttribute('ping');
    a.removeAttribute('data-ved');
    a.removeAttribute('jsaction');
  }

  function clean(root = document) {
    if (root instanceof HTMLAnchorElement) cleanLink(root);
    root.querySelectorAll?.('a[href]').forEach(cleanLink);
  }

  function start() {
    clean(document);
    new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) if (node instanceof Element) clean(node);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
