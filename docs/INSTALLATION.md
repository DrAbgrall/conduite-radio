# Installer sa propre instance

## 1. Choisir l’édition

Pour le mode local, servir les fichiers et ouvrir `local.html` suffit. La connexion Supabase reste désactivée par défaut. Pour l’édition collaborative, créer un projet Supabase neuf dont vous êtes administrateur.

## 2. Initialiser un projet Supabase neuf

Les scripts suivants ne sont pas destinés à réinitialiser une base existante. Sauvegarder et faire relire toute adaptation à une installation déjà utilisée.

Dans le SQL Editor de **votre** projet, exécuter les fichiers de `docs/supabase/migrations/` dans l’ordre numérique, de `000` à `006`. Les noms historiques « BROUILLON » sont conservés dans cette première copie ; ces fichiers correspondent au moteur testé et doivent être éprouvés dans votre propre environnement. Aucun n’est exécuté automatiquement par le site ou les tests GitHub.

- `000` crée les quatre tables métier vides et les politiques de collaboration ouverte.
- `001` à `005` ajoutent révisions, historique, corbeille, transactions et conflits HTTP.
- `006` ajoute la suppression administrative d’un espace et une liste privée des comptes autorisés à cette action.

Activer Realtime pour `spaces`, `emissions`, `blocks`, `sequences` dans les réglages de publication Supabase. Conserver `radio_v19_private` hors des schémas exposés de la Data API. Configurer des sauvegardes indépendantes ; l’historique interne ne remplace pas une sauvegarde du projet.

## 3. Configurer l’application

Copier `config.example.js` vers `config.js`, puis renseigner :

```js
collaborationEnabled: true,
supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
supabasePublishableKey: 'VOTRE_CLE_PUBLIQUE',
organisation: 'Votre école ou radio',
contactEmail: 'contact@votre-organisation.example',
adminEmail: 'admin@votre-organisation.example',
```

Utiliser uniquement la clé publishable ou anon. Ne jamais mettre de clé secret/service_role dans un fichier de navigateur. `config.js` et les fichiers `.env` sont exclus de Git.

## 4. Activer le compte Admin

Dans Authentication → Users, créer votre compte Admin confirmé. Choisir son mot de passe directement dans Supabase ; ne pas le placer dans le dépôt. Puis, dans le SQL Editor de votre projet, autoriser ce compte pour la suppression d’espaces :

```sql
INSERT INTO radio_v19_private.admin_users(user_id)
SELECT id FROM auth.users
WHERE lower(email) = lower('admin@votre-organisation.example')
  AND email_confirmed_at IS NOT NULL;
```

Se connecter ensuite sur `admin.html` pour créer un premier espace. La suppression exige sélection, vérification du contenu et saisie du nom exact. Les conducteurs sont placés dans la corbeille, puis l’espace est retiré. Après restauration, un conducteur d’un espace disparu est récupéré sans espace.

**Périmètre des droits actuels :** la suppression par la nouvelle fonction vérifie le compte autorisé côté serveur. Les autres politiques et fonctions restent ouvertes pour permettre l’usage sans connexion. Masquer le bouton public ne réserve donc pas réellement toutes les créations ou suppressions aux seuls administrateurs. Un usage privé nécessite une stratégie d’accès serveur adaptée.

## 5. Héberger

Un hébergement statique HTTPS convient. Sur Vercel, le fichier `vercel.json` lance `node tools/build-release.mjs` et publie `dist/`. Renseigner les variables de projet :

| Variable | Valeur |
| --- | --- |
| `RADIO_COLLABORATION_ENABLED` | `true` pour la collaboration, `false` pour une distribution locale |
| `RADIO_SUPABASE_URL` | URL de votre projet |
| `RADIO_SUPABASE_PUBLIC_KEY` | clé publique publishable/anon |
| `RADIO_ORGANISATION` | nom de l’organisation |
| `RADIO_CONTACT_EMAIL` | contact public |
| `RADIO_ADMIN_EMAIL` | email du compte Admin |
| `RADIO_APP_NAME` | nom de l’application |

Sans ces variables, le build laisse la collaboration désactivée. Le dossier `dist/` contient uniquement les ressources applicatives et la configuration publique générée.

## 6. Recette avant ouverture

Créer des conducteurs fictifs, essayer deux navigateurs simultanés, tester les exports, l’historique et la corbeille. Installer la PWA sur les appareils visés, attendre sa préparation hors ligne puis vérifier sans réseau. Valider le transfert JSON entre local et collaboratif. Ne pas annoncer un appareil comme validé avant essai réel.
