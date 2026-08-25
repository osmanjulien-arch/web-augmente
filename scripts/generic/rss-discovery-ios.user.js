// ==UserScript==
// @name         Web Augmenté — RSS Discovery iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Signale lorsqu'une page expose un flux RSS ou Atom.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const feeds=[...document.querySelectorAll('link[type="application/rss+xml"],link[type="application/atom+xml"]')];
  if(!feeds.length) return;
  if(document.getElementById('wa-rss-badge')) return;
  const a=document.createElement('a');a.id='wa-rss-badge';a.href=feeds[0].href;a.textContent='RSS';
  a.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;border:1px solid currentColor;border-radius:999px;padding:6px 9px;font:700 12px -apple-system;color:#b45309;text-decoration:none';
  document.documentElement.appendChild(a);
})();