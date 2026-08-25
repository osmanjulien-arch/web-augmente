// ==UserScript==
// @name         Web Augmenté — X Media Tools iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Ajoute un bouton discret pour ouvrir l'image d'un post X dans sa source directe.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  function enhance(root=document){
    root.querySelectorAll?.('article').forEach(a=>{
      if(a.querySelector('.wa-x-media')) return;
      const img=a.querySelector('img[src*="twimg.com/media"]'); if(!img) return;
      const b=document.createElement('a');b.className='wa-x-media';b.textContent='Média';b.href=img.src;b.target='_blank';
      b.style.cssText='display:inline-block;margin:6px 0;padding:4px 8px;border:1px solid currentColor;border-radius:999px;font:600 12px -apple-system;text-decoration:none';
      a.appendChild(b);
    });
  }
  enhance();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&enhance(n)))).observe(document.documentElement,{childList:true,subtree:true});
})();