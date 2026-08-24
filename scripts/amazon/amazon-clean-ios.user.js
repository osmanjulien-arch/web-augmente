// ==UserScript==
// @name         Web Augmenté — Amazon Clean iOS
// @namespace    https://github.com/osmanjulien-arch/web-augmente
// @version      0.1.0
// @description  Supprime les contenus sponsorisés, les blocs publicitaires et Rufus sur Amazon.fr.
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

  function start() {
    clean(document);

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            clean(node);
          } else if (node.parentElement) {
            clean(node.parentElement);
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
