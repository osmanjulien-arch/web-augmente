// ==UserScript==
// @name         Web Augmenté — Page Notes iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Ajoute des notes locales persistantes par page, stockées uniquement dans Safari sur l'appareil.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const key='wa-note:'+location.origin+location.pathname;
  const b=document.createElement('button'); b.textContent='Note'; b.style.cssText='position:fixed;left:60px;bottom:84px;z-index:2147483647;border:0;border-radius:999px;padding:10px 12px;background:#111;color:#fff;font:bold 12px -apple-system;box-shadow:0 2px 12px #0005';
  const box=document.createElement('div'); box.style.cssText='display:none;position:fixed;left:10px;right:10px;bottom:136px;z-index:2147483647;background:#fff;border-radius:14px;padding:10px;box-shadow:0 5px 30px #0007';
  const ta=document.createElement('textarea');ta.value=localStorage.getItem(key)||'';ta.placeholder='Note locale pour cette page…';ta.style.cssText='width:100%;height:130px;box-sizing:border-box;font:16px -apple-system;padding:10px;border:1px solid #ccc;border-radius:10px';ta.oninput=()=>localStorage.setItem(key,ta.value);
  const clear=document.createElement('button');clear.textContent='Effacer';clear.style.cssText='margin-top:8px;padding:8px 10px;border:0;border-radius:8px';clear.onclick=()=>{ta.value='';localStorage.removeItem(key)};box.append(ta,clear);b.onclick=()=>box.style.display=box.style.display==='none'?'block':'none';document.documentElement.append(box,b);
})();