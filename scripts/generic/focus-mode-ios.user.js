// ==UserScript==
// @name         Web Augmenté — Focus Mode iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Mode lecture universel léger : masque les distractions autour du contenu principal sans quitter la page.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const id='wa-focus-btn', cls='wa-focus-active';
  const style=document.createElement('style');style.textContent=`html.${cls} body>*:not(main):not(article):not([role="main"]):not(#${id}){display:none!important}html.${cls} main,html.${cls} article,html.${cls} [role="main"]{display:block!important;max-width:820px!important;margin:0 auto!important;padding:18px!important;background:#fff!important;color:#111!important}html.${cls} header,html.${cls} footer,html.${cls} nav,html.${cls} aside{display:none!important}`;document.head.appendChild(style);
  const b=document.createElement('button');b.id=id;b.textContent='Focus';b.style.cssText='position:fixed;right:10px;bottom:136px;z-index:2147483647;border:0;border-radius:999px;padding:10px 12px;background:#111;color:#fff;font:bold 12px -apple-system;box-shadow:0 2px 12px #0005';b.onclick=()=>document.documentElement.classList.toggle(cls);document.documentElement.appendChild(b);
})();