// ==UserScript==
// @name         Web Augmenté — Amazon Clean iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.2.3
// @description  Nettoie Amazon.fr et signale clairement Amazon vs vendeur tiers.
// @match        https://*.amazon.fr/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const removableSelectors = [
    '[data-component-type="sp-sponsored-result"]',
    '[data-component-type="sp-sponsored-products"]',
    '[data-component-type="sp-sponsored-brands"]',
    '[data-component-type="sp-sponsored-video"]',
    '[data-component-type="s-sponsored-result"]',
    '[data-cel-widget^="sp_"]',
    '.AdHolder',
    '[id*="sponsoredProducts" i]',
    '[id^="sp_detail"]',
    '[id^="ape_"]',
    'iframe[src*="amazon-adsystem"]',
    '#nav-swmslot',
    '#desktop-banner',
    '#billboard',
    '[id*="rufus" i]',
    '[class*="rufus" i]',
    '[data-testid*="rufus" i]'
  ].join(',');

  const sponsoredMarkerSelectors = [
    '.puis-sponsored-label-text',
    '.s-sponsored-label-text',
    '[data-ad-details]',
    '[data-adfeedbackdetails]',
    '[aria-label*="Sponsorisé" i]',
    '[aria-label*="Sponsored" i]',
    '[data-testid*="sponsored" i]'
  ].join(',');

  const sponsoredContainerSelector = [
    '[data-component-type="s-search-result"]',
    '.s-result-item',
    '.s-widget-container',
    '[data-asin][data-index]'
  ].join(',');

  const searchResultSelector = [
    '[data-component-type="s-search-result"]',
    '.s-result-item[data-asin]',
    '[data-asin][data-index]'
  ].join(',');

  const sellerCandidateSelector = [
    '#merchant-info',
    '#sellerProfileTriggerId',
    '#tabular-buybox .tabular-buybox-text',
    '[offer-display-feature-name="desktop-merchant-info"]',
    '[data-csa-c-content-id*="seller" i]',
    '[id*="seller" i]',
    '[class*="seller" i]',
    '.a-row.a-size-base.a-color-secondary',
    '.a-size-small.a-color-secondary'
  ].join(',');

  const productPageSelector = '#desktop_buybox, #buybox, #rightCol, #centerCol, #buyNow, #addToCart, [id*="buybox" i], [class*="buybox" i]';
  const badgeClass = 'web-augmente-seller-badge';
  const productBadgeId = 'web-augmente-product-seller-badge';

  function matchesOrDescendants(root, selector) {
    const items = root instanceof Element && root.matches(selector) ? [root] : [];
    return items.concat(Array.from(root.querySelectorAll?.(selector) ?? []));
  }

  function clean(root) {
    for (const element of matchesOrDescendants(root, removableSelectors)) element.remove();
    for (const marker of matchesOrDescendants(root, sponsoredMarkerSelectors)) {
      marker.closest(sponsoredContainerSelector)?.remove();
    }
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function parseSellerText(text) {
    const value = normalizeText(text);
    if (!value) return null;

    const explicit = value.match(/(?:vendu(?:e)?\s+par|sold\s+by)\s*:?\s*([^|•·,;]+)/i);
    if (explicit) {
      const seller = normalizeText(explicit[1]);
      if (seller) return { seller, isAmazon: /\bamazon\b/i.test(seller) };
    }

    const combined = value.match(/(?:expéditeur\s*\/\s*vendeur|expediteur\s*\/\s*vendeur)\s*:?\s*([^|•·,;]+)/i);
    if (combined) {
      const seller = normalizeText(combined[1]);
      if (seller) return { seller, isAmazon: /\bamazon\b/i.test(seller) };
    }

    return null;
  }

  function detectSeller(container) {
    for (const candidate of container.querySelectorAll(sellerCandidateSelector)) {
      const parsed = parseSellerText(candidate.textContent);
      if (parsed) return { ...parsed, anchor: candidate };
    }
    const parsed = parseSellerText(container.textContent);
    return parsed ? { ...parsed, anchor: container } : null;
  }

  function styleBadge(badge, isAmazon) {
    badge.style.cssText = `display:inline-block;margin:6px 0;padding:4px 8px;border:1px solid currentColor;border-radius:999px;font-size:12px;font-weight:700;line-height:1.25;background:#fff;color:${isAmazon ? '#067d62' : '#8a4b00'}`;
  }

  function dedupeProductBadges() {
    const badges = Array.from(document.querySelectorAll(`.${badgeClass}`));
    const productBadges = badges.filter((badge) => badge.id === productBadgeId || badge.dataset.productPage === '1');
    if (productBadges.length <= 1) return productBadges[0] || null;

    const keeper = productBadges[0];
    keeper.id = productBadgeId;
    keeper.dataset.productPage = '1';
    for (const duplicate of productBadges.slice(1)) duplicate.remove();
    return keeper;
  }

  function addProductSellerBadge() {
    const existing = dedupeProductBadges();
    if (existing?.isConnected) return true;

    for (const container of matchesOrDescendants(document, productPageSelector)) {
      if (!(container instanceof Element)) continue;
      const sellerInfo = detectSeller(container);
      if (!sellerInfo) continue;

      const badge = document.createElement('span');
      badge.id = productBadgeId;
      badge.className = badgeClass;
      badge.dataset.productPage = '1';
      badge.textContent = sellerInfo.isAmazon ? 'Vendu par Amazon' : `Vendeur tiers : ${sellerInfo.seller}`;
      styleBadge(badge, sellerInfo.isAmazon);

      const anchor = sellerInfo.anchor;
      if (anchor && anchor !== container && anchor.parentElement) anchor.insertAdjacentElement('afterend', badge);
      else container.insertAdjacentElement('afterbegin', badge);

      dedupeProductBadges();
      return true;
    }
    return false;
  }

  function addSearchSellerBadge(container) {
    if (!(container instanceof Element)) return;
    if (container.querySelector(`.${badgeClass}`)) return;

    const sellerInfo = detectSeller(container);
    if (!sellerInfo) return;

    const badge = document.createElement('span');
    badge.className = badgeClass;
    badge.textContent = sellerInfo.isAmazon ? 'Vendu par Amazon' : `Vendeur tiers : ${sellerInfo.seller}`;
    styleBadge(badge, sellerInfo.isAmazon);

    const anchor = sellerInfo.anchor;
    if (anchor && anchor !== container && anchor.parentElement) anchor.insertAdjacentElement('afterend', badge);
    else container.insertAdjacentElement('afterbegin', badge);
  }

  function enhanceSellerInfo(root) {
    if (/\/dp\//i.test(location.pathname)) {
      addProductSellerBadge();
      dedupeProductBadges();
      return;
    }

    for (const result of matchesOrDescendants(root, searchResultSelector)) addSearchSellerBadge(result);
  }

  function process(root) {
    clean(root);
    enhanceSellerInfo(root);
  }

  function start() {
    process(document);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) process(node);
          else if (node.parentElement) process(node.parentElement);
        }
      }
      if (/\/dp\//i.test(location.pathname)) dedupeProductBadges();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
