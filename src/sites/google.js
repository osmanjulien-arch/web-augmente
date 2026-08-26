function googleSiteModules() {
  return [
    { id: 'google-sponsored', site: 'google', label: 'Masquer les blocs publicitaires identifiés', defaultOn: true,
      run(ctx) { ctx.all('#tads,#tadsb,#bottomads,[data-text-ad="1"]').forEach(el => ctx.hide(el)); } },
    { id: 'google-direct-links', site: 'google', label: 'Liens directs sans redirection Google', defaultOn: true,
      run(ctx) {
        for (const a of ctx.all('a[href]')) {
          const current = ctx.safeHttp(a.getAttribute('href'));
          if (!current) continue;
          let target = current;
          if (['google.com','www.google.com','google.fr','www.google.fr'].includes(current.hostname) && ['/url','/imgres'].includes(current.pathname)) {
            const raw = current.pathname === '/imgres' ? current.searchParams.get('imgurl') : current.searchParams.get('url') || current.searchParams.get('q');
            if (!raw || !/^https?:\/\//i.test(raw)) continue;
            target = ctx.safeHttp(raw);
            if (!target) continue;
            ctx.attr(a, 'href', target.href);
          }
          if (target.hostname !== ctx.location.hostname && !['google.fr','google.com','www.google.fr','www.google.com'].includes(target.hostname)) {
            ctx.attr(a, 'ping', null);
            ctx.attr(a, 'data-ved', null);
          }
          // Keep destination query parameters, signed URLs and jsaction handlers intact.
        }
      } }
  ];
}
