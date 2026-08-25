// ==UserScript==
// @name         Web Augmenté — Magic Navigation iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Nettoie les principaux paramètres de tracking et améliore les liens courants.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  const tracking=/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|si$)/i;
  function cleanUrl(raw){
    try{const u=new URL(raw,location.href);[...u.searchParams.keys()].forEach(k=>tracking.test(k)&&u.searchParams.delete(k));return u.href;}catch{return raw;}
  }
  function clean(root=document){root.querySelectorAll?.('a[href]').forEach(a=>{const h=cleanUrl(a.href);if(h!==a.href)a.href=h;});}
  if(document.documentElement){clean();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&clean(n)))).observe(document.documentElement,{childList:true,subtree:true});}
})();