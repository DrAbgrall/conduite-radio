# Conduite Radio

Créer, organiser et visualiser des conducteurs d’émissions radio, en école ou en radio associative.

Deux éditions partagent le même moteur et le même format JSON :

- **Locale / PWA** : installation avec une icône, travail hors ligne après préparation, stockage sur l’appareil et historique local.
- **Collaborative** : espaces de projet, édition partagée avec Supabase Realtime, historique et corbeille.

Le transfert entre les deux éditions se fait par export/import JSON. Il n’y a pas de synchronisation automatique entre une copie locale et le conducteur partagé.

## Essayer sur son ordinateur

Prérequis : Python 3 et un navigateur récent.

```sh
cp config.example.js config.js
python3 -m http.server 8765 --bind 127.0.0.1
```

Ouvrir **http://127.0.0.1:8765/local.html**. Attendre « Application prête hors ligne sur cet appareil ». L’édition locale ne nécessite ni compte, ni Supabase, ni script CDN. Le guide d’installation s’adapte au navigateur. Une installation depuis un site hébergé nécessite HTTPS.

Les conducteurs restent liés à cet appareil, cette adresse et ce navigateur. Conserver des exports JSON indépendants ; effacer les données de navigation peut effacer les conducteurs et leur historique.

## Installer sa propre édition collaborative

Suivre [le guide d’installation](docs/INSTALLATION.md). Chaque école ou radio utilise **son propre projet Supabase** et son propre hébergement. Aucune connexion à une base d’exploitation n’est fournie dans ce dépôt.

Le fonctionnement collaboratif actuel est volontairement ouvert : toute personne connaissant l’adresse peut lire et modifier les conducteurs partagés. Le nom d’un espace n’est pas une autorisation d’accès. Choisir ce mode en connaissance de cause avant d’y déposer du contenu.

## Fonctions

- Horaires et durées calculés, passage à minuit.
- Séquences et blocs : édition, duplication et réorganisation.
- Modèles de conducteurs, import/export JSON compatible V18.2.
- Exports HTML, Excel XLSX, impression PDF via le navigateur.
- Horloge graphique et répartition par type de séquence.
- Historique et restauration ; corbeille des conducteurs dans l’édition collaborative.
- Affichage mobile portrait/paysage, colonnes fixes et défilement horizontal.
- Mise à jour PWA automatique depuis l’accueil, différée pendant l’édition.

Limite actuelle : un conducteur exporté en JSON ne doit pas dépasser 2 Mo. Les graphiques décrivent le déroulé prévu, sans fonction de chronomètre de direct.

## Développer et vérifier

Installer Deno 2, puis :

```sh
deno test --no-config --no-lock --allow-read=. tests
```

Les tests applicatifs ne se connectent à aucun service réel. La recette IndexedDB se trouve dans `tests/storage-browser.html` et emploie des données fictives. Les outils SQL ciblent un moteur PostgreSQL embarqué fourni explicitement par l’opérateur ; ne jamais les exécuter sur une base de production.

146 tests applicatifs passent sur la copie de diffusion. Une installation et le paysage ont été confirmés par le propriétaire sur Android ; la matrice complète des appareils, navigateurs et logiciels d’export reste à compléter. Les simulations ne remplacent pas cette recette.

## Organisation du code

`js/core.js`, `document-model.js` : moteur métier ; `local-store.js`, `local-session.js` : stockage local ; `supabase-repository.js`, `atomic-document.js` : collaboration ; `exports.js`, `visualizations.js` : restitutions ; `app.js`, `local-app.js`, `admin.js` : interfaces. Le cache PWA n’intercepte pas les requêtes Supabase.

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour contribuer et [SECURITY.md](SECURITY.md) pour signaler un problème de sécurité.

## Licence

Ce projet est distribué sous licence **GNU AGPL-3.0** (SPDX : `AGPL-3.0-only`). Voir [LICENSE](LICENSE). Les contributions sont distribuées sous cette même licence.

Copyright © 2026 DrAbgrall et les contributeur·rices.
