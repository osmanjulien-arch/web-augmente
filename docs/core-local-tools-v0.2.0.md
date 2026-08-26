# WA Core 0.2.0 — premier lot local

## Ce qui est réellement livré

Même identité de userscript et même bouton WA, cinq modules générés à partir de
fichiers sources distincts. Les fonctions des cinq variantes locales suivantes
sont regroupées et durcies, sans importer de nouveau code tiers :

| Ancien fichier (`scripts/generic/`) | Module | Changement concret |
|---|---|---|
| `page-toolbox-ios.user.js` | Navigation et liens | URL propre conservatrice, lien Markdown échappé, plan visible H1–H3 sans modifier leurs IDs, haut/bas |
| `selection-copy-restorer-ios.user.js` | Sélection et copie | Au clic, réversible ; pas de suppression définitive des attributs de la page, ni observer global |
| `rss-discovery-ios.user.js` | Flux RSS et Atom | Tous les flux déclarés (50 max), dédoublonnés, HTTP(S) uniquement ; aucune requête exploratoire |
| `source-capsule-ios.user.js` | Provenance | Dans le panneau WA ; titre, domaine, URL propre/canonique déclarée, date ; aucune prétention de vérification factuelle |
| `page-notes-ios.user.js` | Notes privées locales | GM au lieu de localStorage, URL avec paramètres utiles et fragment, lecture/enregistrement explicites |

L'origine vérifiable de cette reprise est le code de ce dépôt au commit
`81a1739528f35eb35c729394d512ec2c5e4f25a4`. Ce n'est pas une attestation de
provenance/licence de l'historique complet de toutes les variantes ; avant de
copier du code tiers supplémentaire, documenter son URL, commit/version et licence.

Le serveur et son secret ne changent pas. Aucune permission GM supplémentaire.
Les préférences `wa-core:local-modules:v1` et notes `wa-core:note:v1:<URL>` sont
distinctes de `wa-core:token` et `wa-core:endpoint`.
Masquer un module arrête ses effets. Réafficher Sélection et copie ne l'active
pas automatiquement : l'activation demeure volontaire et limitée au document courant.

## Installation depuis l'iPhone, sans PowerShell

1. Ouvrir le [fichier WA Core](https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/core/wa-core-ios.user.js) dans Safari.
2. Ouvrir le panneau de l'extension Userscripts et utiliser son parcours de mise à jour/remplacement du script existant. Conserver exactement le nom de fichier et ne pas créer de doublon.
3. Si un remplacement manuel est nécessaire, modifier le fichier dans le dossier choisi pour Userscripts avec un éditeur compatible iOS : ne pas supposer que l'app iOS fournit un éditeur intégré.
4. Ouvrir complètement le panneau Userscripts, puis recharger la page Web.
5. Vérifier **Web Augmenté · 0.2.0**. Ne pas reconfigurer le token si la capture fonctionne déjà.

Référence d'installation : [documentation officielle Userscripts](https://github.com/quoid/userscripts#usage).

### Éviter les doublons

Si ces cinq scripts autonomes sont installés, les désactiver (ne pas les supprimer)
pendant le test : Page Toolbox, Selection & Copy Restorer, RSS Discovery,
Source Capsule, Page Notes. Ne pas laisser leur ancienne UI/leurs handlers actifs
en parallèle des modules correspondants. **Conserver Amazon Clean et Google Clean** :
ils ne sont pas encore absorbés dans le pack Sites.

Les anciennes notes localStorage restent où elles étaient. Rien n'est supprimé
ni importé automatiquement depuis un stockage accessible au site. Si nécessaire,
les recopier manuellement avant de désactiver l'ancien Page Notes.

## Essai iPhone (critère de promotion)

1. Ouvrir une page publique. Un seul bouton WA ; cinq modules visibles ; aucun token demandé.
2. Navigation : copier une URL avec `utm_source`, vérifier que ce paramètre disparaît
   mais que les paramètres utiles et l'ancre restent ; tester le plan et le retour haut/bas.
3. Copie : sur un site qui bloque la sélection, activer le déblocage puis le désactiver.
   Ne pas tester sur paiement/connexion. Certains handlers précoces ou limitations Safari peuvent résister.
4. RSS : sur une page déclarant deux flux, obtenir deux liens distincts ; sur une autre,
   obtenir « aucun flux déclaré », pas une fausse promesse de découverte exhaustive.
5. Source : vérifier titre/domaine/URL. Une URL canonique est déclarée par le site, pas certifiée par WA.
6. Notes : charger, écrire une note non sensible de test, enregistrer, recharger et relire.
   Vérifier qu'une deuxième page a une autre note. La note ne doit pas apparaître dans la capture envoyée.
7. Modules : masquer RSS, recharger, vérifier qu'il reste masqué ; le réafficher.
8. Ouvrir **Envoyer vers ma mémoire Web Augmenté**, envoyer une page puis une page
   d'un autre domaine, sans nouvelle saisie du token. Vérifier la dernière capture via le MCP.

La copie presse-papiers dépend de l'autorisation/du contexte Safari ; si elle échoue,
le texte est affiché et sélectionnable pour copie manuelle, sans faux message « copié ».
Les notes sont locales à cette installation Userscripts : pas de synchro multi-appareil,
pas de tags/recherche et pas de sauvegarde Cloudflare dans ce lot.

## Vérification développeur

```sh
node tools/build-core.cjs
node tools/build-core.cjs --check
node --check scripts/core/wa-core-ios.user.js
node --test tests/wa-core-ios.test.cjs tests/local-tools.test.cjs
node tools/serve-core-fixture.cjs
```

La fixture est accessible uniquement en local sur `http://localhost:8789`, avec
GM simulé et sans token réel. Les appels WA y sont interceptés, jamais transmis au Worker.
Le sessionStorage sert seulement à simuler GM dans la fixture, jamais dans le userscript distribué.

Les tests Node couvrent les 23 régressions connexion/capture et les modules locaux
dans un DOM simulé. Ce n'est pas un moteur Safari. Dans l'environnement de travail
du 26 août, le navigateur distant refuse l'accès localhost (`ERR_BLOCKED_BY_CLIENT`) :
aucun test visuel navigateur n'est donc revendiqué.

## Retour arrière

Réinstaller le contenu [WA Core 0.1.1 figé](https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/81a1739528f35eb35c729394d512ec2c5e4f25a4/scripts/core/wa-core-ios.user.js)
dans **le même fichier**. Ne pas effacer les données Userscripts. Les clés de connexion
sont identiques ; les notes/préférences 0.2.0 ne sont pas supprimées mais ne sont plus
affichées en 0.1.1. Réactiver au besoin les anciens utilitaires conservés, sans doublon.

La branche `release/amazon-clean-ios-v0.2.3` reste strictement inchangée.
