// ==UserScript==
// @name         Web Augmenté — SponsorBlock Seekbar iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Affiche les segments SponsorBlock sur la barre de progression YouTube sans saut automatique.
// @match        https://www.youtube.com/watch*
// @match        https://m.youtube.com/watch*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  let lastVideo='';
  function id(){return new URL(location.href).searchParams.get('v')||'';}
  async function load(){
    const vid=id(); if(!vid||vid===lastVideo) return; lastVideo=vid;
    document.querySelectorAll('.wa-sb-segment').forEach(n=>n.remove());
    try{
      const url='https://sponsor.ajay.app/api/skipSegments?videoID='+encodeURIComponent(vid)+'&categories='+encodeURIComponent(JSON.stringify(['sponsor','selfpromo','interaction','intro','outro','preview','music_offtopic']));
      const rows=await fetch(url).then(r=>r.ok?r.json():[]);
      const video=document.querySelector('video'); if(!video) return;
      const apply=()=>{
        const bar=document.querySelector('.ytp-progress-list,.player-controls-progress-bar'); if(!bar||!video.duration) return;
        rows.forEach(r=>{const [a,b]=r.segment||[];if(!(b>a))return;const s=document.createElement('span');s.className='wa-sb-segment';s.style.cssText=`position:absolute;left:${a/video.duration*100}%;width:${(b-a)/video.duration*100}%;top:0;bottom:0;background:rgba(0,180,120,.9);pointer-events:none;z-index:9`;bar.appendChild(s);});
      };
      if(video.duration) apply(); else video.addEventListener('loadedmetadata',apply,{once:true});
    }catch{}
  }
  load(); setInterval(load,1500);
})();