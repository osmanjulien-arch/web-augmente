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
      } },
    { id: 'youtube-community-posts', site: 'youtube', label: 'Masquer les publications communautaires', defaultOn: true,
      run(ctx) {
        // A community tab or an individual post opened deliberately remains usable.
        if (/^\/post(?:\/|$)/.test(ctx.location.pathname) || /\/(?:community|posts)(?:\/|$)/.test(ctx.location.pathname)) return;
        const posts = ctx.all([
          'ytd-post-renderer', 'ytd-backstage-post-thread-renderer', 'ytd-backstage-post-renderer',
          'ytm-post-renderer', 'ytm-backstage-post-thread-renderer', 'ytm-backstage-post-renderer',
          'ytd-rich-section-renderer[is-post]', 'ytm-rich-section-renderer[is-post]'
        ].join(','));
        for (const post of posts) {
          ctx.hide(post.closest('ytd-rich-section-renderer,ytm-rich-section-renderer,ytd-rich-item-renderer,ytm-rich-item-renderer') || post);
        }
        // Fallback for new YouTube renderers: /post/ is specific to community posts.
        for (const link of ctx.all('a[href^="/post/"]')) {
          const card = link.closest('ytd-rich-section-renderer,ytm-rich-section-renderer,ytd-rich-item-renderer,ytm-rich-item-renderer,ytd-post-renderer,ytm-post-renderer');
          if (card) ctx.hide(card);
        }
      } }
  ];
}
