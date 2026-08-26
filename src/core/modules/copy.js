// Reuses the intent/CSS of Selection & Copy Restorer, with reversible opt-in behavior.
function createCopyModule() {
  let style = null;
  const events = ['copy', 'contextmenu', 'selectstart'];
  const unblock = event => {
    // Do not interfere with inputs, editors, or WA's own closed shadow tree.
    if (event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-wa-ui]')) return;
    event.stopImmediatePropagation();
  };
  const stop = () => {
    for (const type of events) window.removeEventListener(type, unblock, true);
    style?.remove(); style = null;
  };
  return {
    id: 'copy', title: 'Sélection et copie',
    description: 'Déblocage volontaire sur cette page ; certains blocages du site peuvent résister.',
    mount(ctx) {
      const b = ctx.action('Activer le déblocage sur cette page', () => {
        if (style) { stop(); b.textContent = 'Activer le déblocage sur cette page'; return; }
        if (/checkout|payment|paiement|bank|banque|login|signin|connexion/i.test(location.hostname + location.pathname) ||
            [...document.querySelectorAll('input[type="password"]')].some(el => el.getClientRects().length)) {
          throw new Error('Déblocage non activé sur cette page potentiellement sensible.');
        }
        style = document.createElement('style');
        style.dataset.waUi = '1';
        style.textContent = 'body, body *:not(input):not(textarea):not(select):not(button):not([contenteditable]) { -webkit-user-select: text !important; user-select: text !important; }';
        (document.head || document.documentElement).appendChild(style);
        for (const type of events) window.addEventListener(type, unblock, true);
        b.textContent = 'Désactiver le déblocage sur cette page';
        ctx.status('Déblocage activé pour cette page. Aucun contenu envoyé.', 'success');
      });
    },
    stop
  };
}
