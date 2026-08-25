# Web Augmenté — catalogue d’intégration des userscripts sélectionnés

Cette branche regroupe la présélection issue de l’audit Greasy Fork / OpenUserJS / GitHub-Gists / ScriptCat.

Principe : ne pas installer aveuglément plusieurs scripts qui modifient la même zone d’un site. Les fonctions utiles sont soit intégrées dans un profil Web Augmenté, soit conservées comme script autonome lorsque cela réduit le risque de régression.

## Amazon

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| Amazon Sponsored Products Remover | Supprimer les résultats et blocs sponsorisés | Fonction déjà absorbée et validée dans `scripts/amazon/amazon-clean-ios.user.js` |
| Amazon Enhancement | Sponsorisés, Rufus, améliorations Amazon | Source d’idées uniquement ; ne pas exécuter en parallèle sur iOS |
| Amazon Dark Pattern Blocker | Retirer Prime upsells, offres carte et autres dark patterns | À auditer puis porter dans le profil Amazon |
| SoldBy – Reveal Sellers on Amazon | Afficher vendeur tiers, origine et évaluations | Détection vendeur de base déjà intégrée ; enrichissement origine/évaluations à auditer |
| Prime Video – Show Prime Content Only | Masquer les contenus à louer/acheter sur Prime Video | À intégrer comme script Prime Video séparé |

## Recherche et navigation

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| Search Engine Assistant | Améliorer les pages de moteurs de recherche | À auditer pour Safari iOS |
| Google Search Direct Links | Remplacer les liens Google redirigés par des liens directs | À intégrer en profil Google |
| Don’t Track Me Google | Réduire les URLs de suivi Google | À intégrer en profil Google avec déduplication fonctionnelle |
| Pagetual | Pagination/infinite scroll sur de nombreux sites | À auditer avant activation globale |
| AutoPager | Charger automatiquement les pages suivantes | Alternative/complément à Pagetual ; ne pas activer les deux sur le même site sans test |
| Picviewer CE+ | Améliorer la consultation d’images | À auditer pour compatibilité iOS et permissions |
| Selection and Copying Restorer | Restaurer sélection/copie bloquées | À intégrer comme utilitaire générique si compatible iOS |
| Absolute Enable Right Click & Copy | Restaurer clic droit/copie | Fonction chevauchante avec Selection and Copying Restorer ; audit puis choix d’une seule implémentation par site |
| RSS+ – Show Site All RSS | Détecter/afficher les flux RSS disponibles | À auditer et intégrer comme utilitaire |
| Magic Userscript+ | Utilitaires généraux de navigation | À auditer avant toute activation globale |

## Vidéo

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| YouTube Alchemy | Améliorations de l’interface YouTube | À auditer pour Safari iOS |
| SponsorBlock Seek Bar Only | Visualiser les segments SponsorBlock sur la barre de progression | À auditer : dépendance réseau/API et compatibilité iOS |

## Réseaux sociaux

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| Instagram IG Helper | Améliorations Instagram / médias | À auditer : permissions, téléchargements et compatibilité iOS |
| X/Twitter Media Copy & Download | Copier/télécharger plus facilement les médias X/Twitter | À auditer pour iOS |
| Reddit Login Popup Remover | Supprimer les popups de connexion Reddit | À intégrer comme profil Reddit minimal |

## Utilitaire de provenance

| Script sélectionné | Utilité | Intégration Web Augmenté |
|---|---|---|
| SourceCapsule | Conserver/afficher la provenance utile d’un contenu ou d’une page | À auditer avant intégration |

## Règles d’intégration

1. La version stable Amazon `release/amazon-clean-ios-v0.2.3` ne doit jamais être modifiée.
2. Chaque nouvel apport est développé et testé sur la branche d’intégration avant passage sur `main`.
3. Sur iPhone/Safari, privilégier `@grant none` et éviter les API GM non supportées ou non fiables dans Userscripts.
4. Aucun script tiers n’est copié tel quel tant que sa licence, ses appels réseau, ses permissions et ses dépendances n’ont pas été vérifiés.
5. Les fonctions qui se chevauchent sont fusionnées ou arbitrées ; elles ne sont pas empilées au risque de casser le DOM.
6. Aucun ajout n’est promu comme stable avant un test réel sur iPhone.

## Ordre d’intégration

1. Amazon Dark Pattern Blocker → adaptation dans le profil Amazon.
2. Prime Video – Show Prime Content Only.
3. Google Search Direct Links + Don’t Track Me Google → profil Google unique.
4. Reddit Login Popup Remover.
5. Selection/Copying Restorer → utilitaire générique.
6. Pagetual / AutoPager → audit comparatif puis un seul moteur par site.
7. YouTube Alchemy + SponsorBlock Seek Bar Only.
8. Picviewer CE+, RSS+, Magic Userscript+, Instagram IG Helper, X/Twitter Media Copy & Download, SourceCapsule après audit sécurité/compatibilité.
