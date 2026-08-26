// Adapted from this repository's Page Toolbox. No third-party code imported.
function createToolboxModule() {
  return {
    id: 'toolbox', title: 'Navigation et liens',
    description: 'URL sans suivi, lien Markdown, plan et haut/bas de page.',
    mount(ctx) {
      const { action, output, pageUrl, copyText } = ctx;
      action('Copier l’URL propre', async () => {
        await copyText(pageUrl());
      });
      action('Copier le lien Markdown', async () => {
        const title = document.title.replace(/[\\\[\]]/g, '\\$&').replace(/\s+/g, ' ').slice(0, 500);
        const url = pageUrl().replaceAll('(', '%28').replaceAll(')', '%29');
        await copyText(`[${title}](<${url}>)`);
      });
      action('Haut de page', () => { ctx.close(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      action('Bas de page', () => {
        ctx.close();
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      });
      action('Plan de la page', () => {
        output.replaceChildren();
        const headings = [...document.querySelectorAll('h1,h2,h3')]
          .filter(h => !h.closest('[data-wa-ui]') && h.getClientRects().length && h.textContent.trim())
          .slice(0, 100);
        if (!headings.length) { output.textContent = 'Aucun titre visible H1–H3 trouvé.'; return; }
        for (const heading of headings) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'wa-local-action';
          b.textContent = `${'— '.repeat(Number(heading.tagName[1]) - 1)}${heading.textContent.trim().slice(0, 160)}`;
          b.addEventListener('click', () => {
            if (!heading.isConnected) { output.textContent = 'La page a changé : relance le plan.'; return; }
            ctx.close(); heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          output.appendChild(b);
        }
      });
      // No automatic link rewriting: page navigation and signed URLs are left intact.
    }
  };
}
