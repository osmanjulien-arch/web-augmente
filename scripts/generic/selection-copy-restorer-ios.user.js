// ==UserScript==
// @name         Web Augmenté — Selection & Copy Restorer iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Restaure la sélection de texte, la copie et le menu contextuel sur les sites qui les bloquent.
// @match        http://*/*
// @match        https://*/*
// @exclude      https://*.bank*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const blockedEvents = ['copy','cut','contextmenu','selectstart'];

  function unblockEvent(event) {
    event.stopImmediatePropagation();
  }

  for (const type of blockedEvents) {
    window.addEventListener(type, unblockEvent, true);
    document.addEventListener(type, unblockEvent, true);
  }

  function restore(root = document) {
    const style = document.getElementById('web-augmente-copy-restorer-style') || document.createElement('style');
    style.id = 'web-augmente-copy-restorer-style';
    style.textContent = `
      html, body, body * {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `;
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);

    root.querySelectorAll?.('[oncopy],[oncut],[oncontextmenu],[onselectstart]').forEach((el) => {
      el.removeAttribute('oncopy');
      el.removeAttribute('oncut');
      el.removeAttribute('oncontextmenu');
      el.removeAttribute('onselectstart');
    });
  }

  function start() {
    restore(document);
    new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) if (node instanceof Element) restore(node);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
