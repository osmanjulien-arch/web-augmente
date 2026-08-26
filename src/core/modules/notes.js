// Page Notes behavior moved from site-localStorage to the existing GM storage.
// Old site-readable notes are never imported silently; nothing is sent to WA_MEMORY.
function createNotesModule() {
  let isDirty = () => false;
  return {
    id: 'notes', title: 'Notes privées locales',
    description: 'Une note par URL, dans Userscripts sur cet appareil. Ni envoyée au site ni synchronisée avec le MCP.',
    canDisable: () => !isDirty() || window.confirm('Abandonner la note non enregistrée ?'),
    mount(ctx) {
      let loadedUrl = null, original = '';
      const label = document.createElement('p'); label.textContent = 'Charge la note avant de la modifier.';
      const editor = document.createElement('textarea');
      editor.setAttribute('aria-label', 'Note privée locale');
      editor.placeholder = 'Note personnelle pour cette page…';
      editor.maxLength = 10000; editor.disabled = true; editor.rows = 5;
      ctx.area.append(label, editor);
      isDirty = () => !editor.disabled && editor.value !== original;
      ctx.action('Charger la note de cette page', async () => {
        if (isDirty() && !window.confirm('Abandonner la note non enregistrée ?')) return;
        const url = ctx.pageUrl();
        const value = await ctx.read(`wa-core:note:v1:${url}`, '');
        if (url !== ctx.pageUrl()) throw new Error('La page a changé pendant la lecture : recharge la note.');
        loadedUrl = url; original = value; editor.value = value; editor.disabled = false;
        label.textContent = `Note liée à : ${url}`;
        ctx.status('Note chargée depuis Userscripts, sans envoi réseau.', 'success');
      });
      ctx.action('Enregistrer la note', async () => {
        if (!loadedUrl) throw new Error('Charge d’abord la note de cette page.');
        if (loadedUrl !== ctx.pageUrl()) throw new Error('La page a changé : copie ton brouillon puis charge la note de la nouvelle page.');
        const value = editor.value;
        if (value.length > 10000) throw new Error('Note limitée à 10 000 caractères.');
        await ctx.write(`wa-core:note:v1:${loadedUrl}`, value);
        original = value;
        ctx.status('Note enregistrée dans Userscripts sur cet appareil uniquement.', 'success');
      });
      ctx.action('Effacer la note', async () => {
        if (!loadedUrl || loadedUrl !== ctx.pageUrl()) throw new Error('Charge d’abord la note de cette page.');
        if (!window.confirm('Effacer définitivement cette note locale ?')) return;
        await ctx.write(`wa-core:note:v1:${loadedUrl}`, '');
        original = ''; editor.value = '';
        ctx.status('Note locale effacée. Cette suppression ne peut pas être annulée.', 'success');
      });
    }
  };
}
