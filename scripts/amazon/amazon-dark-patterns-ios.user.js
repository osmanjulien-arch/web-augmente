// ==UserScript==
// @name         Web Augmenté — Amazon Dark Patterns iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Masque sur Amazon.fr les principales incitations Prime, carte et blocs promotionnels agressifs.
// @match        https://*.amazon.fr/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  const selectors = [
    '[id*="prime" i][class*="upsell" i]','[class*="prime" i][class*="upsell" i]',
    '[id*="credit" i][class*="card" i]','[class*="credit-card" i]',
    '[id*="prime-interstitial" i]','[class*="prime-interstitial" i]',
    '[data-csa-c-content-id*="prime" i][class*="a-section" i]',
    '[id*="rufus" i]','[class*="rufus" i]','[data-testid*="rufus" i]'
  ].join(',');
  const textPatterns = [/essayer prime/i,/s'inscrire à prime/i,/amazon prime/i,/carte amazon/i,/offre de carte/i];
  function clean(root=document){
    root.querySelectorAll?.(selectors).forEach(el=>el.remove());
    root.querySelectorAll?.('div,section,aside').forEach(el=>{
      const t=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(t.length>0&&t.length<500&&textPatterns.some(r=>r.test(t))) {
        const hasBuy=el.querySelector?.('#add-to-cart-button,#buy-now-button,[name="submit.add-to-cart"]');
        if(!hasBuy) el.remove();
      }
    });
  }
  function start(){clean();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&clean(n)))).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.documentElement) start(); else addEventListener('DOMContentLoaded',start,{once:true});
})();