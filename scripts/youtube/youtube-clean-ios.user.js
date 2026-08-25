// ==UserScript==
// @name         Web Augmenté — YouTube Clean iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Réduit Shorts, recommandations et distractions YouTube sur Safari iPhone.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const css=`
    ytd-rich-section-renderer, ytd-reel-shelf-renderer,
    ytm-reel-shelf-renderer, [is-shorts], a[href^="/shorts/"]{display:none!important}
  `;
  const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s);
})();