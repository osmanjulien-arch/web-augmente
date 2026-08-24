// ==UserScript==
// @name         Web Augmenté — Amazon Clean iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.2.0
// @description  Nettoie Amazon.fr et signale clairement Amazon vs vendeur tiers quand l'information vendeur est présente dans la page.
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

  const badgeClass = 'web-augmente-seller-badge';

  function matchesOrDescendants(root, selector) {
    const matches = root instanceof Element && root.matches(selector) ? [root] : [];
    return matches.concat(Array.from(root.querySelectorAll?.(selector) ?? []));
  }

  function clean(root) {
    for (const element of matchesOrDescendants(root, removableSelectors)) {
      element.remove();
    }

    for (const marker of matchesOrDescendants(root, sponsoredMarkerSelectors)) {
      const container = marker.closest(sponsoredContainerSelector);
      if (container) {
        container.remove();
      }
    }
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function parseSellerText(text) {
    const value = normalizeText(text);
    if (!value) return null;

    const soldByMatch = value.match(/(?:vendu(?:e)?\s+par|sold\s+by)\s*:?\s*([^|•·,;]+)/i);
    if (soldByMatch) {
      const seller = normalizeText(soldByMatch[1]);
      if (seller) {
        return {
          seller,
          isAmazon: /\bamazon\b/i.test(seller)
        };
      }
    }

    if (/expédié(?:e)?\s+et\s+vendu(?:e)?\s+par\s+amazon|ships?\s+from\s+and\s+sold\s+by\s+amazon/i.test(value)) {
      return { seller: 'Amazon', isAmazon: true };
    }

    return null;
  }

  function detectSeller(container) {
    const candidates = Array.from(container.querySelectorAll(sellerCandidateSelector));

    for (const candidate of candidates) {
      const parsed = parseSellerText(candidate.textContent);
      if (parsed) return { ...parsed, anchor: candidate };
    }

    const sellerLink = container.querySelector('#sellerProfileTriggerId, a[href*="seller="]');
    if (sellerLink) {
      const seller = normalizeText(sellerLink.textContent);
      if (seller) {
        return {
          seller,
          isAmazon: /\bamazon\b/i.test(seller),
          anchor: sellerLink
        };
      }
    }

    return null;
  }

  function addSellerBadge(container) {
    if (!(container instanceof Element)) return;
    if (container.querySelector(`.${badgeClass}`)) return;

    const sellerInfo = detectSeller(container);
    if (!sellerInfo) return;

    const badge = document.createElement('span');
    badge.className = badgeClass;
    badge.dataset.sellerType = sellerInfo.isAmazon ? 'amazon' : 'third-party';
    badge.textContent = sellerInfo.isAmazon
      ? 'Vendu par Amazon'
      : `Vendeur tiers : ${sellerInfo.seller}`;

    badge.style.cssText = [
      'display:inline-block',
      'margin:4px 0',
      'padding:3px 7px',
      'border:1px solid currentColor',
      'border-radius:999px',
      'font-size:12px',
      'font-weight:700',
      'line-height:1.25',
      'background:#fff',
      sellerInfo.isAmazon ? 'color:#067d62' : 'color:#8a4b00'
    ].join(';');

    const anchor = sellerInfo.anchor;
    if (anchor?.parentElement) {
      anchor.insertAdjacentElement('afterend', badge);
    } else {
      container.prepend(badge);
    }
  }

  function enhanceSellerInfo(root) {
    const productPageContainers = [
      document.querySelector('#desktop_buybox'),
      document.querySelector('#buybox'),
      document.querySelector('#rightCol'),
      document.querySelector('#centerCol')
    ].filter(Boolean);

    for (const container of productPageContainers) {
      addSellerBadge(container);
    }

    for (const result of matchesOrDescendants(root, searchResultSelector)) {
      addSellerBadge(result);
    }
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
          if (node instanceof Element) {
            process(node);
          } else if (node.parentElement) {
            process(node.parentElement);
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
