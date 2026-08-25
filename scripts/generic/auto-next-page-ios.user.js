// ==UserScript==
// @name         Web Augmenté — Auto Next Page iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Charge automatiquement la page suivante sur les sites qui exposent un lien rel=next.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  let loading=false, done=false;
  async function next(){
    if(loading||done) return;
    const link=document.querySelector('link[rel="next"],a[rel="next"]'); if(!link?.href){done=true;return;}
    loading=true;
    try{
      const html=await fetch(link.href,{credentials:'include'}).then(r=>r.text());
      const doc=new DOMParser().parseFromString(html,'text/html');
      const main=document.querySelector('main')||document.body;
      const src=doc.querySelector('main')||doc.body;
      [...src.children].forEach(n=>main.appendChild(document.importNode(n,true)));
      const n=doc.querySelector('link[rel="next"],a[rel="next"]');
      if(n?.href) link.href=n.href; else done=true;
    }catch{done=true;} finally{loading=false;}
  }
  addEventListener('scroll',()=>{if(innerHeight+scrollY>document.documentElement.scrollHeight-1200) next();},{passive:true});
})();