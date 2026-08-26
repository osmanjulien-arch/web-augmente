function youtubeSiteModules() {
  return [
    { id: 'youtube-shorts', site: 'youtube', label: 'Masquer les Shorts dans les listes', defaultOn: true,
      run(ctx) {
        // An intentionally opened Short remains usable. Ordinary shelves are never hidden wholesale.
        if (/^\/shorts(?:\/|$)/.test(ctx.location.pathname)) return;
        ctx.all('ytd-reel-shelf-renderer,ytm-reel-shelf-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,yt-shorts-lockup-view-model')
          .forEach(el => ctx.hide(el));
        for (const card of ctx.all('ytd-rich-item-renderer,ytm-rich-item-renderer,ytd-video-renderer,ytm-video-with-context-renderer')) {
          const links = [...card.querySelectorAll('a[href]')].map(a => ctx.safeHttp(a.getAttribute('href'))).filter(Boolean);
          const local = links.filter(url => ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname));
          if (local.some(url => url.pathname.startsWith('/shorts/')) && !local.some(url => url.pathname === '/watch')) ctx.hide(card);
        }
      } }
  ];
}
