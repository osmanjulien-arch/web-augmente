# Politique d’intégration des userscripts

## Objectif

Web Augmenté réutilise les meilleures idées et briques userscript existantes sans transformer le dépôt en collection opaque de scripts tiers.

## Règles

1. Ne jamais copier un script tiers sans vérifier sa licence.
2. Inspecter `@match`, `@include`, `@grant`, `@connect`, `@require` et toute ressource distante.
3. Préférer `@grant none` et une portée de domaine minimale pour les variantes Safari iOS.
4. Séparer les fonctions universelles des adaptations propres à un site.
5. Extraire une fonction utile plutôt que vendoriser un gros script tout-en-un lorsque la licence le permet.
6. Conserver la provenance, la version ou le commit source et la date d’audit.
7. Tester chaque module isolément avant activation dans une version installable.
8. Ne pas ajouter une fonction uniquement parce qu’elle existe : elle doit répondre à une friction utilisateur identifiée.

## Statuts du catalogue

- `active` : module Web Augmenté actuellement utilisé.
- `audit` : candidat identifié, non intégré.
- `approved` : licence, code, permissions et intérêt validés.
- `adapted` : fonction adaptée au projet.
- `rejected` : écarté avec raison documentée.

## Grille d’audit minimale

Pour chaque candidat :

- URL source canonique
- auteur
- licence
- dernière version / commit
- domaines ciblés
- permissions demandées
- appels réseau externes
- dépendances `@require`
- stockage local ou GM
- comportement DOM
- compatibilité Safari iOS / Userscripts
- risque de casse
- fonction exacte que Web Augmenté souhaite réutiliser
- décision : intégrer, adapter, prendre comme référence ou rejeter

## Architecture cible

`catalog/` contient la connaissance sur les scripts tiers.

`scripts/` contient uniquement les scripts Web Augmenté installables ou nos adaptations autorisées.

Le prototype Amazon iOS reste indépendant tant qu’un nouveau module n’a pas passé l’audit et les tests.
