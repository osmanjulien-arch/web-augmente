// ==UserScript==
// @name         Web Augmenté — Source Capsule iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Affiche une capsule compacte avec domaine, titre et URL propre de la page.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  if(document.getElementById('wa-source-capsule')) return;
  const u=new URL(location.href);['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(k=>u.searchParams.delete(k));
  const d=document.createElement('details');d.id='wa-source-capsule';
  d.style.cssText='position:fixed;left:10px;bottom:10px;z-index:2147483646;background:#fff;color:#111;border:1px solid #999;border-radius:12px;padding:5px 8px;max-width:85vw;font:12px -apple-system';
  const s=document.createElement('summary');s.textContent=location.hostname;s.style.fontWeight='700';
  const p=document.createElement('div');p.textContent=(document.title||'')+'\n'+u.href;p.style.cssText='white-space:pre-wrap;word-break:break-all;padding-top:6px';
  d.append(s,p);document.documentElement.appendChild(d);
})();