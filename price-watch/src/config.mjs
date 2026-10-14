// Ajouter un produit = ajouter une entrée ; aucun changement au moteur nécessaire.
export const watches = [
  { id: 'iphone-17-pro-max-256', label: 'iPhone 17 Pro Max 256 Go neuf',
    model: 'iphone 17 pro max', capacityGb: 256, condition: 'new', maxEuro: 1100,
    currency: 'EUR', enabled: true }
];

// RSS = découverte d'annonces (sans garantie du prix affiché).
// json = prix structurés provenant d'un endpoint que TU contrôles / autorises.
export const sources = [
  { id: 'dealabs-telephonie', type: 'rss',
    url: 'https://www.dealabs.com/rss/groupe/telephonie',
    allowedHost: 'www.dealabs.com', enabled: true }
  // { id: 'mon-comparateur', type: 'json',
  //   url: 'https://api.exemple.fr/prices.json', allowedHost:'api.exemple.fr', enabled: false }
];

export function activeWatches(env) {
  return watches.filter(w => w.enabled).map(w => ({ ...w,
    maxCents: Math.round(Number((w.id === 'iphone-17-pro-max-256' && env?.WATCH_MAX_EUR) || w.maxEuro) * 100)
  }));
}
