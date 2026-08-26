function redditSiteModules() {
  return [
    { id: 'reddit-app-prompts', site: 'reddit', label: 'Masquer les invitations à ouvrir l’application', defaultOn: true,
      run(ctx) {
        const selectors = '[data-testid="xpromo-modal"],.XPromoPopup,.xpromo-popup,shreddit-async-loader[bundlename*="xpromo" i],[role="dialog"],faceplate-dialog';
        for (const box of ctx.all(selectors)) {
          // Real login/signup forms, text editors and native modal dialogs are deliberately left alone.
          if (box.matches('dialog[open]') || box.querySelector('form,input,textarea,[contenteditable],dialog[open]')) continue;
          const text = box.textContent.replace(/\s+/g, ' ').trim();
          if (text.length > 2500) continue;
          const prompt = /open in (?:the )?app|continue in (?:the )?app|ouvrir dans l[’'](?:app|application)|continuer dans l[’']application/i.test(text);
          const appLink = [...box.querySelectorAll('a[href]')].some(a => {
            const raw = a.getAttribute('href') || '';
            if (/^reddit:\/\//i.test(raw)) return true;
            const url = ctx.safeHttp(raw);
            return url && (url.hostname === 'reddit.app.link' || url.hostname === 'apps.apple.com' || url.hostname === 'play.google.com');
          });
          if (prompt && appLink) ctx.hide(box);
        }
        // No unconditional scroll unlocking: do not interfere with other dialogs or the consent UI.
      } }
  ];
}
