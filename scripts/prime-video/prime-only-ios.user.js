// ==UserScript==
// @name         Web Augmenté — Prime Video Prime Only iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Masque sur Prime Video les rangées principalement dédiées à l'achat ou la location.
// @match        https://www.primevideo.com/*
// @match        https://*.amazon.fr/gp/video/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const re = /(acheter|achat|louer|location|store|boutique|rent|buy)/i;
  function clean(root=document){
    root.querySelectorAll?.('section,article,[data-testid],div').forEach(el=>{
      const t=(el.getAttribute?.('aria-label')||el.querySelector?.('h1,h2,h3')?.textContent||'').trim();
      if(t&&t.length<160&&re.test(t)) el.remove();
    });
  }
  clean();
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&clean(n)))).observe(document.documentElement,{childList:true,subtree:true});
})();