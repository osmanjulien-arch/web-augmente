// ==UserScript==
// @name         Web Augmenté — Reddit Clean iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Supprime les popups de connexion et débloque le scroll sur Reddit.
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const selectors = [
    '[role="dialog"] [href*="login"]',
    'shreddit-async-loader[bundlename*="login"]',
    '[data-testid*="login" i][role="dialog"]',
    '[class*="login" i][class*="modal" i]',
    '[class*="popup" i] [href*="login"]'
  ];

  function removeClosest(node) {
    const target = node.closest?.('[role="dialog"], faceplate-dialog, shreddit-async-loader, [class*="modal" i], [class*="popup" i]');
    target?.remove();
  }

  function clean(root = document) {
    for (const selector of selectors) {
      root.querySelectorAll?.(selector).forEach(removeClosest);
    }
    document.documentElement.style.overflow = '';
    if (document.body) document.body.style.overflow = '';
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
