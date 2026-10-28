# Dépendances et ressources

L’édition collaborative charge `@supabase/supabase-js` depuis jsDelivr (version 2.118.0). Supabase JS est distribué sous licence MIT ; consulter les notices du paquet pour la version résolue. La version CDN est figée dans les pages collaborative et Admin.

La PWA locale ne charge aucun script CDN. Les exports XLSX, les graphiques et les icônes radio sont produits par les sources du projet. Les icônes ne contiennent pas de marque d’une école ou d’une radio tierce.

Deno est utilisé pour les tests. Les bancs SQL peuvent utiliser PGlite (Apache-2.0) comme outil de développement téléchargé séparément ; le moteur n’est pas inclus dans le dépôt ni dans l’application. Python sert seulement à lancer un serveur de développement.

Les workflows GitHub utilisent `actions/checkout` et `denoland/setup-deno` ; ils ne déploient rien et n’accèdent à aucune base réelle.

Sources des licences : https://github.com/supabase/supabase-js/blob/master/LICENSE et https://github.com/electric-sql/pglite/blob/main/LICENSE.
