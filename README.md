# Web Augmenté

Prototype personnel de couche d’amélioration du Web par userscripts.

## Phase actuelle

V1 — CLEAN

Premier test :
Safari iPhone + Userscripts + Amazon.fr.

## Installation Amazon iOS

1. Installer l’extension Safari Userscripts.
2. Autoriser Userscripts sur amazon.fr.
3. Ouvrir l’URL RAW de `amazon-clean-ios.user.js` dans Safari.
4. Installer le script via Userscripts.
5. Recharger Amazon.fr.

## Catalogue de briques

Les userscripts tiers présélectionnés sont suivis dans `catalog/userscripts.json`.

Un candidat n’est pas copié ni activé automatiquement. Il doit d’abord passer l’audit décrit dans `docs/integration-policy.md` : licence, permissions, dépendances, appels réseau, compatibilité Safari iOS et utilité réelle.

## Structure

- `scripts/` : scripts Web Augmenté installables et adaptations validées.
- `catalog/` : registre des briques externes présélectionnées.
- `docs/` : règles d’audit et d’intégration.

## Principe

Aucune nouvelle fonction ne doit être ajoutée tant qu’elle ne répond pas à une friction utilisateur clairement identifiée.
