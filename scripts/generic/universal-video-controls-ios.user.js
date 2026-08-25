// ==UserScript==
// @name         Web Augmenté — Universal Video Controls iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Contrôles rapides de vitesse, retour 1x et PiP pour les vidéos HTML5 sur Safari iPhone.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const id='wa-video-controls';
  const current=()=>Array.from(document.querySelectorAll('video')).find(v=>!v.paused)||document.querySelector('video');
  const ensure=()=>{
    if(document.getElementById(id)||!document.querySelector('video')) return;
    const bar=document.createElement('div'); bar.id=id;
    bar.style.cssText='position:fixed;right:10px;bottom:84px;z-index:2147483647;background:rgba(20,20,20,.88);color:#fff;padding:6px;border-radius:12px;display:flex;gap:5px;font:12px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 12px #0005';
    [0.5,1,1.25,1.5,2].forEach(s=>{const b=document.createElement('button');b.textContent=s+'×';b.style.cssText='border:0;border-radius:8px;padding:7px 8px;background:#fff;color:#111;font-weight:700';b.onclick=()=>{const v=current();if(v)v.playbackRate=s};bar.appendChild(b)});
    const pip=document.createElement('button'); pip.textContent='PiP'; pip.style.cssText='border:0;border-radius:8px;padding:7px 8px;background:#fff;color:#111;font-weight:700'; pip.onclick=async()=>{const v=current();try{if(v&&document.pictureInPictureEnabled&&v.requestPictureInPicture)await v.requestPictureInPicture()}catch{}};bar.appendChild(pip);
    document.documentElement.appendChild(bar);
  };
  ensure(); new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
})();