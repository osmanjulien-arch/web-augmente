// ==UserScript==
// @name         Web Augmenté — Image Viewer iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Ouvre une image seule en plein écran au toucher long simulé par double-tap.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  let last=0;
  document.addEventListener('touchend',e=>{
    const img=e.target.closest?.('img'); if(!img) return;
    const now=Date.now(); if(now-last<350){ const src=img.currentSrc||img.src; if(src) location.href=src; }
    last=now;
  },true);
})();