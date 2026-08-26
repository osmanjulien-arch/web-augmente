// Expands this repository's RSS Discovery: all declared feeds, no automatic fetch.
function createFeedsModule() {
  return {
    id: 'feeds', title: 'Flux RSS et Atom',
    description: 'Liste les flux déclarés par la page, sans les contacter.',
    mount(ctx) {
      ctx.action('Chercher les flux de cette page', () => {
        ctx.output.replaceChildren();
        const seen = new Set();
        const candidates = document.querySelectorAll('link[type="application/rss+xml"],link[type="application/atom+xml"]');
        for (const feed of candidates) {
          const url = ctx.safeUrl(feed.href);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const a = document.createElement('a');
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.className = 'wa-local-link';
          a.textContent = `${(feed.title || 'Flux').slice(0, 120)} — ${url}`;
          ctx.output.appendChild(a);
          if (seen.size === 50) break;
        }
        if (!seen.size) ctx.output.textContent = 'Aucun flux RSS/Atom déclaré dans cette page. Cela ne prouve pas que le site n’en possède pas.';
      });
    }
  };
}
