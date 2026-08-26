# Inventaire fonctionnel — Web Augmenté

Audit du code local le 26 août 2026, base `81a1739`, premier lot Core `0.2.0`.
Ce registre couvre les **26 références nommées dans le rappel initial**, plus les utilitaires internes.
Le périmètre n'est pas limité aux cinq modules du premier lot. Aucun original tiers
n'est importé dans ce lot : les variantes Web Augmenté existantes sont réutilisées/adaptées.

## Lire les statuts

- **Partiel autonome** : une variante existe dans `scripts/`, mais ne couvre pas tout l'original ; pas encore fusionnée.
- **Partiel Core** : des fonctions sont fusionnées dans Core 0.2.0, d'autres restent au backlog.
- **À intégrer** : aucune implémentation correspondante suffisante trouvée dans le dépôt.
- **Test iPhone** : uniquement les essais rapportés par Julien (Amazon, Google, capture Core 0.1.1). Les cinq nouveaux modules restent candidats jusqu'à son essai réel.
- **Licence tiers** : à vérifier sur une version/source précise avant tout import de code. Les noms ci-dessous expriment un besoin fonctionnel, pas une attribution de code ni une compatibilité garantie. Ne pas supposer que réécrire une fonction règle automatiquement les obligations d'une copie dérivée.

## Présélection complète

Les chemins ci-dessous sont relatifs à `scripts/`. « Restant » inclut l'audit fonctionnel détaillé de chaque original : on ne prétend pas avoir audité leurs dernières versions ici.

| # | Référence / pack cible | Présent dans le dépôt | Statut | Restant / limite connue | Essai d'acceptation |
|---|---|---|---|---|---|
| 1 | Amazon Sponsored Products Remover / Sites | `amazon/amazon-clean-ios.user.js` : sponsorisés et blocs publicitaires | Partiel autonome, test iPhone rapporté | Routeur, interrupteurs, validation anti-faux positifs | Résultats sponsorisés retirés, résultats ordinaires et achat conservés |
| 2 | Amazon Enhancement / Sites | Même fichier : sponsorisés, Rufus | Partiel autonome | Inventaire des autres fonctions de l'original | Rufus masqué sans casser recherche/fiche produit |
| 3 | Amazon Dark Pattern Blocker / Sites | `amazon/amazon-dark-patterns-ios.user.js` : heuristiques Prime/carte | Partiel autonome | Sélecteurs trop larges à revoir avant fusion | Upsell masqué, prix/options/achat toujours accessibles |
| 4 | SoldBy / Sites | Amazon Clean : badge vendeur si texte détectable | Partiel autonome | Origine, réputation/évaluations non implémentées | Distinguer Amazon/vendeur tiers, signaler vendeur introuvable |
| 5 | Prime Video – Show Prime Content Only / Sites | `prime-video/prime-only-ios.user.js` : suppression de rangées d'achat/location | Partiel autonome | Pas de filtre fiable par titre ni entitlement d'abonnement | Garder inclus Prime, ne pas masquer une rangée mixte entière |
| 6 | Search Engine Assistant / Core + Sites | Nettoyage Google seulement | À intégrer pour fonctions propres | Sélecteur de moteurs, recherche enrichie, audit original | Relancer une requête sur un autre moteur sans perdre le texte |
| 7 | Google Search Direct Links / Sites | `google/google-clean-ios.user.js` : redirections URL/imgres | Partiel autonome, test iPhone rapporté | URLs sémantiques et évolution DOM à tester | Liens résultat directs et destination correcte |
| 8 | Don't Track Me Google / Sites | Même profil : paramètres, ping/data-ved/jsaction | Partiel autonome | Retrait global de paramètres potentiellement utiles à limiter | Réduire suivi sans casser la destination/recherche |
| 9 | Pagetual / Core | `generic/auto-next-page-ios.user.js` : rel=next seulement | Partiel autonome, non promouvable en l'état | Résolution URL relatives, DOM importé non assaini, prévention boucles ; pas de règles Pagetual | Pagination bornée, sans doublons ni code importé |
| 10 | AutoPager / Core | Même prototype rel=next | Partiel autonome | Fusion avec Pagetual en un seul moteur, arrêt/réversibilité | Un seul chargement, bouton arrêt et absence de doublons |
| 11 | Picviewer CE+ / Core | `generic/image-viewer-ios.user.js` : double-tap vers image | Partiel autonome | Ni galerie ni vrai visualiseur ; conflit de gestes | Galerie et fermeture préservent position de lecture |
| 12 | Selection and Copying Restorer / Core | Module `copy`, dérivé du script local | Partiel Core | Activation volontaire/session ; ne supprime plus définitivement les handlers ; blocages précoces du site possibles | Sélection/copie sur fixture bloquée, OFF rétablit le comportement initial |
| 13 | Absolute Enable Right Click & Copy / Core | Même module `copy` : sélection, copie, menu contextuel | Partiel Core | Pas de garantie universelle ni de modification des éditeurs/formulaires | Menu contextuel rétabli sans casser une saisie |
| 14 | RSS+ / Core | Module `feeds` : tous les flux RSS/Atom déclarés, dédoublonnés | Partiel Core | Pas de découverte exhaustive par règles de site ou exploration réseau | 2 flux déclarés → 2 liens, aucun appel avant clic |
| 15 | Magic Userscript+ / Core | `generic/magic-navigation-ios.user.js` : liens nettoyés ; Toolbox copie une URL sans suivi | Partiel autonome | Découverte de scripts/styles, navigation enrichie non intégrées | Choix d'une fonction par site sans réécriture invasive |
| 16 | Find Scripts For This Site / Core | Aucun moteur de découverte | À intégrer | Catalogue, recherche par domaine, provenance/risques, pas d'installation automatique | Trouver des candidats sans les présenter comme sûrs ou installés |
| 17 | YouTube Alchemy / Sites | `youtube/youtube-clean-ios.user.js` : CSS Shorts | Partiel autonome | Très loin du périmètre original ; contrôles/modules à inventorier | Masquer Shorts sans masquer contenu standard |
| 18 | SponsorBlock Seek Bar Only / Sites | `youtube/sponsorblock-seekbar-ios.user.js` : requête + marques barre | Partiel autonome | Polling permanent, erreurs silencieuses, SPA et compatibilité iOS à revoir | Segments cohérents après changement vidéo ; aucun saut automatique |
| 19 | Instagram IG Helper / Sites | `social/instagram-media-tools-ios.user.js` : première image d'article | Partiel autonome | Carrousels, vidéos, téléchargement et règles iOS non couverts | Identifier le bon média de la publication courante |
| 20 | X/Twitter Media Copy & Download / Sites | `social/x-media-tools-ios.user.js` : lien première image twimg | Partiel autonome | Multi-images, vidéo, sauvegarde/copie non couvertes | Image de publication, pas avatar ; limitation vidéo explicite |
| 21 | Reddit Login Popup Remover / Sites | `reddit/reddit-clean-ios.user.js` : modales, scroll | Partiel autonome | Sélecteurs et rétablissement du scroll à limiter | Fermer invitation intrusive sans casser connexion volontaire |
| 22 | SourceCapsule / Core | Module `source` : titre, domaine, URL propre/canonique, consultation | Partiel Core | Pas d'analyse d'auteur, fiabilité ou archivage de provenance | Métadonnées affichées comme déclarations du site, HTML non exécuté |
| 23 | UTags / Core | Module `notes` : une note par URL via GM | Partiel Core | Tags, recherche, raccourcis et synchro absents | Notes de deux pages distinctes conservées après reload |
| 24 | Summarize with AI / AI | Capture Core + lecture MCP uniquement, pas de module de résumé Safari | À intégrer | Extraction, choix fournisseur, quotas gratuits, réponse dans Safari | Résumé sur action explicite ; erreur claire si quota épuisé |
| 25 | AI Chat Assistant multi-model / AI | Aucun module | À intégrer | Routage et limites iOS, pas de clé fournisseur dans le navigateur | Choix explicite du modèle, pas de bascule payante |
| 26 | Ophel Atlas / AI | Aucun module | À intégrer | Plan/recherche conversation, reprise lecture, prompts, exports ; audit licence/version obligatoire | Navigation et export réels sur une conversation de test |

## Utilitaires Web Augmenté supplémentaires

| Utilitaire local | Couverture actuelle | Décision |
|---|---|---|
| Page Toolbox | URL propre, Markdown, titres H1–H3, haut/bas | Fusionné dans `toolbox`, test iPhone à faire |
| Selection & Copy Restorer iOS | Sélection/copie/menu | Fusionné dans `copy`, activation volontaire et nettoyage réversible |
| RSS Discovery iOS | Première déclaration de flux dans ancien script | Fusionné dans `feeds`, désormais liste dédoublonnée et filtrée HTTP(S) |
| Source Capsule iOS | Domaine/titre/URL | Fusionné dans `source`, pas de deuxième bouton flottant |
| Page Notes iOS | Ancien localStorage par origin/path | Fusionné dans `notes`, GM par URL avec query/hash, sans migration silencieuse |
| Focus Mode | CSS masque certains enfants de body | Non fusionné : peut masquer le conteneur principal du site |
| Open-in-App Killer | Suppression par texte/position, observer global | Non fusionné : faux positifs et charge DOM à réduire |
| Universal Video Controls | Vitesse, tentative PiP | Non fusionné : prise en charge PiP Safari et erreurs à expliciter |
| Image Viewer iOS | Navigation vers une image au double-tap | Non fusionné : geste destructif pour position de lecture, pas de galerie |
| Magic Navigation iOS | Nettoyage automatique des liens | Non fusionné : ne pas casser URLs signées/paramètres utiles |
| Auto Next Page iOS | Prototype fetch/import de DOM | Non fusionné : audit sécurité requis avant promotion |

## Lots et maintien du périmètre

1. **Livré en code candidat** : Core 0.2.0, cinq modules locaux, UI commune, interrupteurs, tests. Validation Safari réelle attendue.
2. **Suivant** : pack Sites avec routeur et interrupteurs ; reprendre Amazon/Google/Reddit sans toucher à la branche Amazon stable. Revoir d'abord les suppressions non réversibles.
3. Navigation/médias/découverte : pagination sûre, galerie, vidéos, RSS enrichi, recherche de scripts. Pas de chargement de code distant arbitraire.
4. AI : outils de conversation/prompts/export, puis résumé/question avec fournisseur choisi et budget strict. Aucun basculement payant automatique.

Ne déclarer aucun original « entièrement intégré » tant que sa matrice fonctionnelle et ses tests ne le démontrent. Aucun de ces lots n'autorise une collecte automatique des pages.
