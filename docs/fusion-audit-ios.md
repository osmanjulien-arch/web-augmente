# Audit fusion — Web Augmenté Safari iOS

## Décision

La meilleure cible n’est pas un seul userscript monolithique mais **3 packs** installables dans Userscripts sur Safari iPhone :

1. `web-augmente-core-ios.user.js` — fonctions universelles et méta-userscripts.
2. `web-augmente-sites-ios.user.js` — adaptations par site.
3. `web-augmente-ai-ios.user.js` — fonctions IA et outils de conversations LLM.

Deux packs seraient possibles techniquement, mais le mélange IA + navigation universelle augmenterait les permissions, les risques de régression et la difficulté de diagnostic. Un seul pack est déconseillé.

## Contraintes Userscripts Safari iOS confirmées

Le benchmark Userscripts Safari indique que les API modernes `GM.setValue/getValue`, `GM.xmlHttpRequest`, `GM.openInTab` et `GM.setClipboard` sont disponibles. En revanche `GM.registerMenuCommand`, `GM.addValueChangeListener`, `unsafeWindow`, `GM.download` et plusieurs variantes legacy `GM_*` ne sont pas fiables ou ne sont pas supportées.

Conséquence : les scripts tiers ne doivent pas être empilés tels quels. On porte leurs fonctions dans une interface flottante Web Augmenté, on remplace les menus GM par une UI DOM et les listeners de stockage par du polling léger ou des événements internes.

## Pack 1 — Core iOS

Fonctions à fusionner :

- Find Scripts For This Site : recherche Greasy Fork / OpenUserJS / ScriptCat / GitHub / Gist depuis le domaine courant.
- Magic Userscript+ : découverte visuelle des scripts/styles applicables à la page.
- Search Engine Assistant : outils de recherche génériques qui ne dépendent pas de Google.
- Selection and Copying Restorer + Absolute Enable Right Click & Copy.
- Pagetual + AutoPager : un seul moteur de page suivante avec règles de sécurité.
- Picviewer CE+ : sous-ensemble mobile pertinent (agrandissement, galerie, navigation image).
- RSS+ : découverte de flux.
- Links Helper / Magic Userscript+ utilities : URL directes, parsing liens, navigation.
- UTags / UTags Shortcuts : mémoire locale, tags/notes, raccourcis par site — à intégrer progressivement plutôt que copier toute la base 50+ sites.
- SourceCapsule : provenance, URL nettoyée, métadonnées de page.
- Page Toolbox, Focus Mode, Page Notes, Open-in-App Killer, Universal Video Controls déjà créés.

Interface cible : un seul bouton flottant `WA` ouvrant des onglets `Page`, `Découvrir`, `Mémoire`, `Médias`, `Navigation`.

## Pack 2 — Sites iOS

Adaptateurs activés uniquement selon `location.hostname` :

- Amazon : Sponsored Products Remover + fonctions utiles d’Amazon Enhancement + Dark Pattern Blocker + SoldBy.
- Prime Video : Prime Only.
- Google : Direct Links + Don’t Track Me Google + fonctions de Search Engine Assistant.
- Reddit : login/app popup remover.
- YouTube : YouTube Alchemy mobile + SponsorBlock timeline + contrôles vidéo.
- Instagram : outils médias compatibles iOS.
- X/Twitter : copie/lien/médias compatibles iOS.

Le pack conserve un routeur de site et ne charge que le module correspondant au domaine courant.

## Pack 3 — AI iOS

Fonctions à fusionner :

- Summarize with AI : extraction Readability, résumé OpenAI/Gemini, chat de suivi, choix modèle.
- AI Chat Assistant Multi-Model : distribution d’un prompt vers plusieurs plateformes IA, mais sans dépendre des API legacy `GM_*` / `GM_addValueChangeListener`; utiliser stockage moderne + polling et prévoir que Safari peut suspendre les onglets en arrière-plan.
- Ophel Atlas : reprendre seulement les fonctions userscript réellement utiles sur iPhone — plan de conversation, recherche, reprise de lecture, bibliothèque/file de prompts, export Markdown/JSON. Ne pas copier le script complet 1,7 Mo dans le pack.
- AI Conversation Navigator / exporters : fusionnés dans le même module de chat IA.

Architecture : bouton `AI` sur les pages ordinaires pour résumer/discuter ; panneau enrichi sur ChatGPT/Claude/Gemini/Grok/etc. pour naviguer/exporter/relancer des prompts.

## Faisabilité

- Fusion fonctionnelle en 3 packs : **OUI**.
- Fusion en 2 packs : **possible**, mais moins robuste (Core+Sites, AI séparé).
- Fusion en 1 seul pack : **techniquement possible mais déconseillée** à cause du poids, des permissions, de la maintenance et des régressions croisées.

## Points de vigilance

1. Ne pas copier du code GPL (notamment Ophel Atlas) dans un bundle non-GPL sans traiter correctement les obligations de licence. Refaire les fonctions utiles réduit aussi le poids et la dépendance au DOM de chaque plateforme.
2. Les API legacy `GM_*` utilisées par certains scripts sont incompatibles avec Userscripts Safari ; portage requis.
3. Les scripts multi-onglets sont moins fiables sur iOS quand Safari suspend les onglets en arrière-plan.
4. Les modules universels doivent rester inactifs tant que l’utilisateur n’ouvre pas le panneau ou qu’une condition de page n’est pas détectée, afin de réduire CPU/batterie.
5. Chaque module doit pouvoir être désactivé individuellement depuis le panneau WA pour isoler rapidement une régression.

## Ordre de construction rapide

1. Construire Core iOS en réutilisant les scripts Web Augmenté déjà créés et en ajoutant Discovery + Memory.
2. Construire Sites iOS en important les modules actuellement séparés sans modifier leur logique validée.
3. Construire AI iOS en portant Summarize with AI puis ajouter navigateur/export et enfin multi-modèle.
4. Tester les 3 packs sur iPhone avant remplacement des scripts individuels.
5. Conserver les scripts individuels désactivés pendant une période de validation comme solution de repli.
