// ==UserScript==
// @name         Web Augmenté — Open-in-App Killer iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Masque de façon conservatrice les overlays imposant l'ouverture d'une app ou une connexion et restaure le scroll.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const phrases=['ouvrir dans l’app','ouvrir dans l’application','open in app','continue in app','use the app','se connecter pour continuer','log in to continue','sign in to continue'];
  const scan=()=>{
    document.documentElement.style.overflow='auto'; document.body && (document.body.style.overflow='auto');
    for(const el of document.querySelectorAll('div,section,aside')){
      const s=getComputedStyle(el); if(!['fixed','sticky'].includes(s.position)) continue;
      const r=el.getBoundingClientRect(); if(r.width<innerWidth*.6||r.height<80) continue;
      const t=(el.innerText||'').toLowerCase().replace(/\s+/g,' ');
      if(phrases.some(p=>t.includes(p))) el.remove();
    }
  };
  scan(); new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
})();