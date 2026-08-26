# Web Augmenté — catalogue d’intégration des userscripts sélectionnés

Cette branche regroupe la présélection issue de l’audit Greasy Fork / OpenUserJS / GitHub-Gists / ScriptCat.

**État vérifié du code au 26 août 2026 :** consulter
[l'inventaire fonctionnel](functional-inventory.md), qui complète cette liste
historique avec Find Scripts, UTags et les trois références IA du rappel initial.
Il distingue variante partielle, fonction fusionnée et test réel iPhone.
Les descriptions historiques ci-dessous ne valent pas validation fonctionnelle complète.

## Périmètre verrouillé

L’objectif est d’intégrer **toute la présélection**, pas uniquement les premiers scripts de la roadmap. Aucun script de cette liste ne doit être oublié.

Quand deux scripts couvrent la même fonction, Web Augmenté doit conserver la meilleure implémentation ou fusionner leurs fonctions utiles au lieu d’exécuter deux scripts concurrents. Si un script tiers est techniquement incompatible avec Safari iOS, sa fonction reste dans le périmètre : elle doit être portée/adaptée dans une variante compatible, sauf impossibilité technique démontrée et documentée.

Principe : ne pas installer aveuglément plusieurs scripts qui modifient la même zone d’un site. Les fonctions utiles sont soit intégrées dans un profil Web Augmenté, soit conservées comme script autonome lorsque cela réduit le risque de régression.

## Amazon

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| Amazon Sponsored Products Remover | Supprimer les résultats et blocs sponsorisés | Fonction déjà absorbée et validée dans `scripts/amazon/amazon-clean-ios.user.js` |
| Amazon Enhancement | Sponsorisés, Rufus, améliorations Amazon | Fonctions utiles à reprendre sans exécuter le script original en parallèle sur iOS |
| Amazon Dark Pattern Blocker | Retirer Prime upsells, offres carte et autres dark patterns | À auditer puis porter dans le profil Amazon |
| SoldBy – Reveal Sellers on Amazon | Afficher vendeur tiers, origine et évaluations | Détection vendeur de base déjà intégrée ; enrichissement origine/évaluations à porter |
| Prime Video – Show Prime Content Only | Masquer les contenus à louer/acheter sur Prime Video | À intégrer comme script Prime Video séparé |

## Recherche et navigation

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| Search Engine Assistant | Améliorer les pages de moteurs de recherche | À auditer puis adapter à Safari iOS |
| Google Search Direct Links | Remplacer les liens Google redirigés par des liens directs | À intégrer en profil Google |
| Don’t Track Me Google | Réduire les URLs de suivi Google | À intégrer en profil Google avec déduplication fonctionnelle |
| Pagetual | Pagination/infinite scroll sur de nombreux sites | À intégrer après audit des règles/sites supportés |
| AutoPager | Charger automatiquement les pages suivantes | Fonctions utiles à comparer/fusionner avec Pagetual selon les sites |
| Picviewer CE+ | Améliorer la consultation d’images | À auditer puis adapter à iOS si nécessaire |
| Selection and Copying Restorer | Restaurer sélection/copie bloquées | À intégrer comme utilitaire générique |
| Absolute Enable Right Click & Copy | Restaurer clic droit/copie | Fonctions utiles à fusionner avec l’utilitaire de restauration de copie |
| RSS+ – Show Site All RSS | Détecter/afficher les flux RSS disponibles | À intégrer comme utilitaire |
| Magic Userscript+ | Utilitaires généraux de navigation | Fonctions utiles à auditer puis intégrer sans doublons |

## Vidéo

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| YouTube Alchemy | Améliorations de l’interface YouTube | À auditer puis adapter à Safari iOS |
| SponsorBlock Seek Bar Only | Visualiser les segments SponsorBlock sur la barre de progression | À intégrer si l’API/dépendance réseau est compatible et sûre |

## Réseaux sociaux

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| Instagram IG Helper | Améliorations Instagram / médias | À auditer puis adapter à iOS |
| X/Twitter Media Copy & Download | Copier/télécharger plus facilement les médias X/Twitter | À auditer puis adapter à iOS |
| Reddit Login Popup Remover | Supprimer les popups de connexion Reddit | À intégrer comme profil Reddit minimal |

## Utilitaire de provenance

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| SourceCapsule | Conserver/afficher la provenance utile d’un contenu ou d’une page | À auditer puis intégrer |

## Règles d’intégration

1. La version stable Amazon `release/amazon-clean-ios-v0.2.3` ne doit jamais être modifiée.
2. Chaque nouvel apport est développé et testé sur la branche d’intégration avant passage sur `main`.
3. Sur iPhone/Safari, privilégier `@grant none` et éviter les API GM non supportées ou non fiables dans Userscripts.
4. Aucun script tiers n’est copié tel quel tant que sa licence, ses appels réseau, ses permissions et ses dépendances n’ont pas été vérifiés.
5. Les fonctions qui se chevauchent sont fusionnées ou arbitrées ; elles ne sont pas empilées au risque de casser le DOM.
6. Aucun ajout n’est promu comme stable avant un test réel sur iPhone.
7. **Toutes les fonctions utiles de toute la présélection restent dans le périmètre jusqu’à intégration, adaptation ou rejet technique documenté.**

## Ordre d’intégration

L’ordre ci-dessous sert uniquement à limiter les régressions ; il ne réduit pas le périmètre.

1. Amazon Dark Pattern Blocker + fonctions utiles restantes d’Amazon Enhancement + SoldBy.
2. Prime Video – Show Prime Content Only.
3. Google Search Direct Links + Don’t Track Me Google + Search Engine Assistant.
4. Reddit Login Popup Remover.
5. Selection and Copying Restorer + Absolute Enable Right Click & Copy.
6. Pagetual + AutoPager.
7. YouTube Alchemy + SponsorBlock Seek Bar Only.
8. Picviewer CE+.
9. RSS+ – Show Site All RSS.
10. Magic Userscript+.
11. Instagram IG Helper.
12. X/Twitter Media Copy & Download.
13. SourceCapsule.
