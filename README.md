# Web Augmenté

Prototype personnel de couche d’amélioration du Web par userscripts.

## Phase actuelle

V1 — CLEAN + boucle Web Augmenté minimale

Premier test :
Safari iPhone + Userscripts + Amazon.fr.

La branche `feature/wa-core-v1` ajoute une boucle volontaire et légère, désormais lisible par un MCP OAuth en lecture seule :

`Safari → WA Core iOS → /api/wa → Cloudflare KV → /mcp → ChatGPT`.

## Installation Amazon iOS

1. Installer l’extension Safari Userscripts.
2. Autoriser Userscripts sur amazon.fr.
3. Ouvrir l’URL RAW de amazon-clean-ios.user.js dans Safari.
4. Installer le script via Userscripts.
5. Recharger Amazon.fr.

La branche stable `release/amazon-clean-ios-v0.2.3` reste indépendante et ne doit pas être modifiée.

## Installation WA Core iOS

1. Déployer l'endpoint décrit dans [`worker/README.md`](worker/README.md).
2. Ouvrir dans Safari l'[URL RAW de WA Core iOS](https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/core/wa-core-ios.user.js).
3. Installer le fichier avec Userscripts ; pour une mise à jour, remplacer le WA Core existant sans changer son nom de fichier ni créer de doublon.
4. Sur une page Web, toucher le bouton `WA`.
5. Choisir `Configurer la connexion`, puis saisir l'URL `/api/wa` et le token personnel.
6. Tester `Envoyer cette page`, puis envoyer une seconde fois : le serveur doit répondre `new`, puis `already_seen`.

Le script n'envoie rien automatiquement. Il transmet uniquement du texte après une action explicite.

**WA Core 0.1.1** corrige l’accès aux API de l’extension Safari : configuration
partagée entre sites dans Userscripts, envoi par `GM.xmlHttpRequest`, aucun repli
vers le stockage ou le réseau de la page. Le test de connexion public ne demande
pas de token. Après remplacement, ouvrir le panneau Userscripts puis recharger
la page ; le menu WA affiche la version. Cette mise à jour du userscript ne
nécessite pas de redéployer le Worker.

### Core 0.2.0 — premier lot de fonctions locales (candidat iPhone)

Le même bouton WA regroupe désormais cinq modules : navigation/liens/plan,
restauration volontaire sélection-copie, flux RSS/Atom, fiche source et notes
locales privées. Le panneau donne priorité à ces outils ; les boutons d'envoi
existants se trouvent dans **Envoyer vers ma mémoire Web Augmenté**.

Chaque module peut être affiché/masqué, réglage conservé via GM. Aucun scan
permanent ni envoi réseau pour ces outils. Le déblocage de copie ne s'active
qu'au clic et peut être annulé. Les notes restent dans Userscripts, pas dans le MCP.
Le token, le nom du script et les clés de connexion restent inchangés.

- [Inventaire complet : 26 références, fonctions présentes et manquantes](docs/functional-inventory.md)
- [Installation, remplacement des anciens utilitaires et test iPhone](docs/core-local-tools-v0.2.0.md)

Cette version n'est **pas** la fusion des trois packs terminée ni une validation
de tous les scripts tiers. Un premier pack Sites est désormais disponible ci-dessous ;
le pack AI et les fonctions restantes sont encore à intégrer.

Sources modulaires : `src/core/`. Ne pas éditer directement le bundle généré.

```sh
node tools/build-core.cjs
node tools/build-core.cjs --check
node --test tests/wa-core-ios.test.cjs tests/local-tools.test.cjs
```

## WA Sites 0.1.0 — améliorations automatiques (candidat iPhone)

Un deuxième fichier regroupe huit fonctions locales pour Amazon.fr, Google.fr/com,
YouTube et Reddit. Le bouton **Sites**, en bas à gauche, propose des interrupteurs
et **Voir l’original — pause**. Le bouton **WA** et la connexion mémoire restent inchangés.

- Amazon : sponsorisés et Rufus masqués, badge vendeur si identifiable ; encarts Prime/carte en option.
- Google : publicités identifiées masquées et liens directs, sans supprimer les paramètres de destination.
- YouTube : Shorts masqués dans les listes, sans bloquer un Short ouvert volontairement.
- Reddit : certaines invitations à ouvrir l’application, pas les vrais formulaires de connexion.

[Installer WA Sites dans Userscripts](https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/sites/wa-sites-ios.user.js)
— [installation, limites et essai avant/après](docs/wa-sites-v0.1.0.md).

**Garder WA Core actif.** Désactiver les anciens nettoyeurs Amazon/Google/YouTube/Reddit
correspondants pendant l’essai pour éviter des effets en double. Aucun token à saisir,
aucun appel réseau, aucun déploiement Cloudflare. Les huit fonctions ne prétendent pas
reproduire tous les scripts tiers de l’inventaire. La validation Safari réelle reste à faire.

Sources : `src/sites/`, bundle généré : `scripts/sites/wa-sites-ios.user.js`.
La dépendance LinkeDOM sert uniquement aux tests Node, jamais au userscript distribué.

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm test
```

## Documentation V1

- [Périmètre, API et protocole de test iPhone](docs/wa-core-v1.md)
- [Déploiement du Worker Cloudflare et connexion MCP](worker/README.md)

## Principe

Aucune nouvelle fonction ne doit être ajoutée tant qu’elle ne répond pas à une friction utilisateur clairement identifiée.
