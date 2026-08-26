// ==UserScript==
// @name         Web Augmenté — WA Sites iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Nettoyage local réversible Amazon, Google, Reddit et Shorts YouTube. Aucun envoi ni token.
// @match        https://amazon.fr/*
// @match        https://*.amazon.fr/*
// @match        https://google.fr/*
// @match        https://www.google.fr/*
// @match        https://google.com/*
// @match        https://www.google.com/*
// @match        https://reddit.com/*
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @inject-into  content
// @updateURL    https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/sites/wa-sites-ios.user.js
// @downloadURL  https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/sites/wa-sites-ios.user.js
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('wa-sites-ios-host')) return;
  const sitesGM = typeof GM !== 'undefined' && GM ? GM : null;
  /* WA_SITES_MODULES */
  startSitesApp(sitesGM);
})();
