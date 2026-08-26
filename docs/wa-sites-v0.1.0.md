# WA Sites 0.1.1 — moins de bruit pendant la navigation

## Résultat attendu

Pas besoin d’ouvrir un outil pour chaque page : les fonctions actives s’appliquent
sur les sites compatibles. Le bouton **Sites** sert à choisir les fonctions et à
comparer avec la page d’origine. Aucun envoi automatique, aucune clé ni connexion
Cloudflare dans ce pack. Le MCP continue de lire les pages envoyées volontairement
par **WA Core** ; il ne pilote pas ces réglages Safari.

| Site | Fonction | Par défaut | Limite assumée |
|---|---|---|---|
| Amazon.fr | Résultats et blocs sponsorisés identifiés | Oui | Sélecteurs connus seulement, pas toutes les publicités |
| Amazon.fr | Blocs Rufus | Oui | Dépend des identifiants du site |
| Amazon.fr | Encarts Prime/carte identifiés | Non, option | Aucun balayage global de texte ; ne touche pas aux boutons d’achat |
| Amazon.fr | Badge vendeur | Oui | Seulement si une mention « vendu par » est lisible ; « expédié par Amazon » ne suffit pas |
| Google.fr/com | Blocs publicitaires identifiés | Oui | Sur `/search` seulement |
| Google.fr/com | Liens directs | Oui | Redirections `/url` et `/imgres` reconnues ; retrait de `ping`/`data-ved` des liens externes, pas de garantie anti-suivi totale |
| YouTube | Shorts dans les listes | Oui | Cartes mixtes conservées ; `/shorts/...` volontairement ouvert n’est pas filtré |
| YouTube | Publications communautaires dans les recommandations | Oui | Un post ou un onglet Communauté ouvert volontairement reste accessible |
| Reddit | Invitations à ouvrir l’application | Oui | Texte et lien vers l’app requis ; connexion, éditeurs, consentement non ciblé et dialogues natifs ouverts conservés |

Les paramètres des destinations Google, y compris les signatures, ne sont pas
supprimés. Les titres de produits ne sont pas utilisés pour deviner le vendeur.
Le module Reddit ne force pas le déverrouillage du scroll : si un site conserve un
verrou de défilement, utiliser **Voir l’original** et fermer sa fenêtre normalement.
Il ne remplace donc pas entièrement l’ancien nettoyeur Reddit.

## Installer sur iPhone — pas besoin du PC

1. Dans Safari, ouvrir le [fichier WA Sites](https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/sites/wa-sites-ios.user.js).
2. Passer par l’extension Userscripts pour installer ce **nouveau fichier**, sans remplacer WA Core.
3. Dans Userscripts, désactiver les anciens scripts correspondants si installés :
   Amazon Clean, Amazon Dark Patterns, Google Clean, YouTube Clean, Reddit Clean.
   Les conserver pour un retour arrière. Laisser **WA Core** actif.
4. Autoriser l’extension sur le site testé, puis recharger ce site.
5. Vérifier le bouton **Sites** en bas à gauche et la version **0.1.1** dans son panneau.

Suivre le parcours d’installation de l’extension ; ne pas supposer qu’iOS fournit
un éditeur de scripts intégré. Référence : [documentation Userscripts](https://github.com/quoid/userscripts#usage).
Les autres scripts non repris ne sont ni désactivés ni supprimés par WA Sites.

## Un essai utile, en une minute

1. Ouvrir une recherche Amazon contenant des résultats sponsorisés, ou une page
   YouTube contenant une rangée Shorts. Si aucun élément ciblé n’est présent, le
   compteur reste à zéro : ce n’est pas un test concluant du nettoyage.
2. Toucher **Sites → Voir l’original — pause** : les éléments masqués doivent revenir.
3. Toucher **Réactiver le nettoyage** : ils doivent disparaître à nouveau.
4. Désactiver une fonction, recharger : le choix doit rester désactivé.

« Voir l’original » annule **uniquement les modifications de WA Sites**, pas celles
d’autres extensions. La pause est temporaire ; les interrupteurs sont persistants.
Le compteur indique le nombre d’éléments modifiés par fonction, pas une mesure de
vitesse ni un nombre garanti de publicités bloquées.

Pour Amazon, vérifier aussi que prix, variantes et boutons d’achat restent visibles,
sans effectuer d’achat. Pour Google, vérifier un lien avec paramètres utiles. Pour
YouTube, vérifier qu’une publication communautaire disparaît de l’accueil, tandis
qu’une vidéo ordinaire, un Short direct et un onglet Communauté ouvert restent accessibles.
Pour Reddit, vérifier qu’un vrai formulaire de connexion reste utilisable.

## Architecture et confidentialité

- Neuf modules, un routeur, un observateur DOM temporisé à 150 ms (pas de `setInterval`).
- Le traitement est suspendu quand la page est masquée. Les changements de page
  dynamiques déclenchent une nouvelle vérification ; les pages sensibles connues
  sont exclues et les effets précédents y sont annulés.
- Si la première page chargée est exclue, aucun panneau n’est injecté. Recharger
  une page compatible si une navigation interne n’a pas déclenché Userscripts.
- Les changements sont consignés et réversibles : masquage, attributs de liens,
  badges. Aucun bloc original n’est supprimé. Une nouvelle valeur de lien posée
  par le site n’est pas écrasée au retour arrière.
- Préférences dans `GM.getValue` / `GM.setValue`, clé `wa-sites:settings:v1`.
  Aucun accès aux clés WA Core, aux notes ou au token ; aucun repli `localStorage`.
- Si les préférences ne sont pas lisibles, pause et activation temporaire explicite.
  Une erreur de sauvegarde est affichée, sans prétendre avoir enregistré le choix.
- Les blocs masqués portent `hidden`, donc sont exclus de l’extraction WA Core.
  L’interface et les badges portent `data-wa-ui`, également exclus des captures.
- Aucun code distant chargé, aucune requête réseau. Aucun contrôle à distance de Safari.

Reprise fonctionnelle conservatrice des variantes locales Amazon/Google/YouTube/Reddit
du dépôt au commit `1ca3dbc38a18c3626d0ca457428e049e072d0819`. Aucun import supplémentaire
d’un original tiers dans ce lot. Les noms de l’inventaire ne valent pas attestation
de couverture complète ou d’audit de licence d’un projet tiers.

## Vérification développeur et limites

```sh
npm ci --ignore-scripts
npm run build
npm run check
node --check scripts/sites/wa-sites-ios.user.js
npm test
```

Tests DOM avec LinkeDOM : routeur, exclusions, faux positifs ciblés, liens et paramètres,
restauration, réglages, mode temporaire, erreurs de sauvegarde, navigation dynamique,
mise en pause et GM lexical Safari. Le bundle généré est vérifié contre ses sources.
LinkeDOM est une dépendance de développement uniquement.

Ces tests ne sont **pas** une validation dans Safari ni sur les DOM actuels de chaque
site. Les sélecteurs peuvent nécessiter des adaptations après essai réel. Aucun gain
de performance ni blocage universel n’est revendiqué.

## Retour arrière

Désactiver WA Sites, réactiver les anciens nettoyeurs conservés puis recharger la
page. Ne pas effacer les données Userscripts : WA Core, token et notes restent intacts.
La branche `release/amazon-clean-ios-v0.2.3` et ses fichiers stables ne sont pas modifiés.
