// Functional reuse of Amazon Clean 0.2.3. No removal, purchase submission, or remote calls.
function amazonSiteModules() {
  const purchase = '#add-to-cart-button,#buy-now-button,[name="submit.add-to-cart"],input[type="password"]';
  const safeHide = (ctx, el) => { if (el && !el.matches(purchase) && !el.querySelector(purchase)) ctx.hide(el); };
  return [
    { id: 'amazon-sponsored', site: 'amazon', label: 'Masquer les résultats et blocs sponsorisés', defaultOn: true,
      run(ctx) {
        ctx.all('[data-component-type^="sp-sponsored"],[data-component-type="s-sponsored-result"],[data-cel-widget^="sp_"],.AdHolder,[id^="sp_detail"],iframe[src*="amazon-adsystem"]')
          .forEach(el => safeHide(ctx, el));
        ctx.all('.puis-sponsored-label-text,.s-sponsored-label-text,[data-ad-details],[data-adfeedbackdetails]')
          .forEach(el => safeHide(ctx, el.closest('[data-component-type="s-search-result"],.s-result-item,.s-widget-container,[data-asin][data-index]')));
      } },
    { id: 'amazon-rufus', site: 'amazon', label: 'Masquer les blocs Rufus', defaultOn: true,
      run(ctx) {
        ctx.all('[id^="rufus" i],[id^="nav-rufus" i],[data-testid^="rufus" i],[class~="rufus-container"]')
          .forEach(el => safeHide(ctx, el));
      } },
    { id: 'amazon-upsells', site: 'amazon', label: 'Masquer les encarts Prime/carte identifiés (option)', defaultOn: false,
      run(ctx) {
        // Intentionally no text scan of arbitrary divs: product titles can mention Prime/cards.
        ctx.all('[id*="prime" i][class*="upsell" i],[class~="prime-upsell"],[id="prime-interstitial"],[id="credit-card-upsell"],[class~="credit-card-upsell"]')
          .forEach(el => safeHide(ctx, el));
      } },
    { id: 'amazon-sellers', site: 'amazon', label: 'Signaler le vendeur quand il est identifiable', defaultOn: true,
      run(ctx) {
        const containers = ctx.all('[data-component-type="s-search-result"],#desktop_buybox,#buybox');
        for (const box of containers) {
          if (box.closest('[data-wa-sites-hidden]')) continue;
          const candidates = [...box.querySelectorAll('#merchant-info,#sellerProfileTriggerId,[offer-display-feature-name="desktop-merchant-info"],.tabular-buybox-text')];
          for (const anchor of candidates) {
            const text = anchor.textContent.replace(/\s+/g, ' ').trim();
            const match = text.match(/(?:vendu(?:e)?\s+par|sold\s+by|expéditeur\s*\/\s*vendeur)\s*:?\s*([^|•·;]+)/i);
            if (!match) continue;
            const seller = match[1].split(/\s+(?:expédié par|ships from)/i)[0].trim().slice(0, 120);
            if (!seller) continue;
            ctx.badge(anchor, /^amazon(?:\.fr| eu|\.com)?$/i.test(seller) ? 'Vendu par Amazon' : `Vendeur indiqué : ${seller}`);
            break;
          }
          // Unknown is not guessed from product names or the whole card text.
        }
      } }
  ];
}
