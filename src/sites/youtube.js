function youtubeSiteModules(GM) {
  const sponsorCache = new Map();
  const sponsorCategories = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic'];

  function sponsorSegments(ctx) {
    if (ctx.location.pathname !== '/watch') return;
    const videoId = new URL(ctx.location.href).searchParams.get('v');
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId || '')) return;
    const video = ctx.doc.querySelector('video');
    const bar = ctx.doc.querySelector('.ytp-progress-list,.player-controls-progress-bar');
    const cached = sponsorCache.get(videoId);
    if (cached && cached.state === 'ready' && video && bar && Number.isFinite(video.duration) && video.duration > 0) {
      for (const row of cached.rows) {
        const segment = Array.isArray(row.segment) ? row.segment : [];
        const start = Number(segment[0]), end = Number(segment[1]);
        if (!(start >= 0 && end > start && end <= video.duration + 2)) continue;
        const marker = ctx.doc.createElement('span');
        marker.className = 'wa-sponsorblock-segment';
        marker.title = `SponsorBlock : ${String(row.category || 'segment')}`;
        marker.style.cssText = `position:absolute;left:${start / video.duration * 100}%;width:${(end - start) / video.duration * 100}%;top:0;bottom:0;background:#00b894;pointer-events:none;z-index:9`;
        ctx.insert(bar, marker);
      }
      return;
    }
    if (cached || !GM || typeof GM.xmlHttpRequest !== 'function') return;
    sponsorCache.set(videoId, { state: 'loading' });
    const url = 'https://sponsor.ajay.app/api/skipSegments?videoID=' + encodeURIComponent(videoId) + '&categories=' + encodeURIComponent(JSON.stringify(sponsorCategories));
    return Promise.resolve(GM.xmlHttpRequest({ method: 'GET', url, timeout: 10000, headers: { Accept: 'application/json' } }))
      .then(response => {
        if (response.status === 404) { sponsorCache.set(videoId, { state: 'ready', rows: [] }); return; }
        if (response.status !== 200) throw new Error('SponsorBlock unavailable');
        const rows = JSON.parse(response.responseText || '[]');
        sponsorCache.set(videoId, { state: 'ready', rows: Array.isArray(rows) ? rows.slice(0, 100) : [] });
      })
      .catch(() => sponsorCache.set(videoId, { state: 'error' }));
  }

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
      } },
    { id: 'youtube-sponsorblock', site: 'youtube', label: 'Afficher les segments SponsorBlock (envoie seulement l’identifiant vidéo)', defaultOn: false,
      run: sponsorSegments }
  ];
}
