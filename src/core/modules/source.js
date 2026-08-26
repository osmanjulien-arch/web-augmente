// Consolidates this repository's Source Capsule in the shared WA panel.
function createSourceModule() {
  return {
    id: 'source', title: 'Provenance de la page',
    description: 'Titre, adresse, URL canonique déclarée et date de consultation — sans vérifier la fiabilité du contenu.',
    mount(ctx) {
      ctx.action('Afficher la fiche source', () => {
        const canonical = ctx.safeUrl(document.querySelector('link[rel~="canonical"]')?.href);
        ctx.output.textContent = [
          `Titre : ${document.title.slice(0, 500)}`,
          `Domaine : ${location.hostname}`,
          `Adresse sans suivi : ${ctx.pageUrl()}`,
          `URL canonique déclarée par le site : ${canonical || 'non indiquée ou invalide'}`,
          `Consultée le : ${new Date().toLocaleString('fr-FR')}`
        ].join('\n');
      });
    }
  };
}
