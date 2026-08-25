// ==UserScript==
// @name         Web Augmenté — Page Toolbox iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Boîte à outils universelle : URL propre, lien Markdown, plan de page et navigation rapide.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const clean=()=>{const u=new URL(location.href);['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','si'].forEach(k=>u.searchParams.delete(k));return u.toString()};
  const copy=async t=>{try{await navigator.clipboard.writeText(t)}catch{const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}};
  const btn=document.createElement('button');btn.textContent='WA';btn.style.cssText='position:fixed;left:10px;bottom:84px;z-index:2147483646;border:0;border-radius:999px;width:44px;height:44px;background:#111;color:#fff;font:bold 14px -apple-system;box-shadow:0 2px 12px #0005';
  const panel=document.createElement('div');panel.style.cssText='display:none;position:fixed;left:10px;bottom:136px;z-index:2147483647;width:min(320px,88vw);max-height:55vh;overflow:auto;background:#fff;color:#111;border-radius:14px;padding:10px;box-shadow:0 5px 30px #0007;font:14px -apple-system';
  const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='display:block;width:100%;margin:5px 0;padding:10px;border:1px solid #ddd;border-radius:10px;background:#f7f7f7;text-align:left';b.onclick=fn;panel.appendChild(b)};
  add('Copier URL propre',()=>copy(clean())); add('Copier lien Markdown',()=>copy(`[${document.title.replace(/\]/g,'')}](${clean()})`)); add('Haut de page',()=>scrollTo({top:0,behavior:'smooth'})); add('Bas de page',()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'}));
  add('Plan de la page',()=>{panel.querySelector('[data-wa-outline]')?.remove();const box=document.createElement('div');box.dataset.waOutline='1';box.style.cssText='border-top:1px solid #ddd;margin-top:8px;padding-top:8px';document.querySelectorAll('h1,h2,h3').forEach((h,i)=>{if(!h.id)h.id='wa-h-'+i;const a=document.createElement('a');a.href='#'+h.id;a.textContent=('—'.repeat(Math.max(0,Number(h.tagName[1])-1))+' '+h.textContent.trim()).slice(0,100);a.style.cssText='display:block;padding:4px 0;color:#06c;text-decoration:none';box.appendChild(a)});panel.appendChild(box)});
  btn.onclick=()=>panel.style.display=panel.style.display==='none'?'block':'none'; document.documentElement.append(panel,btn);
})();