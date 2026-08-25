// ==UserScript==
// @name         Web Augmenté — Instagram Media Tools iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Ajoute un accès direct aux images Instagram visibles dans les publications.
// @match        https://www.instagram.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  function enhance(root=document){
    root.querySelectorAll?.('article').forEach(a=>{
      if(a.querySelector('.wa-ig-media')) return;
      const img=a.querySelector('img[src]'); if(!img) return;
      const b=document.createElement('a');b.className='wa-ig-media';b.textContent='Ouvrir média';b.href=img.currentSrc||img.src;b.target='_blank';
      b.style.cssText='display:inline-block;margin:6px;padding:4px 8px;border:1px solid currentColor;border-radius:999px;font:600 12px -apple-system;text-decoration:none';
      a.appendChild(b);
    });
  }
  enhance();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&enhance(n)))).observe(document.documentElement,{childList:true,subtree:true});
})();