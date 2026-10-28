# Contribuer

Les contributions d’écoles, de radios et de développeur·euses sont bienvenues.

- Décrire le problème et les étapes pour le reproduire avec des données fictives.
- Travailler sur une branche, proposer une modification progressive et expliquer sa validation.
- Exécuter `deno test --no-config --no-lock --allow-read=. tests`.
- Préserver le format JSON version 1 ou documenter explicitement la migration.
- Tester les risques de perte de données, d’ordre des séquences et de calcul d’horaires.
- Séparer les évolutions SQL des modifications d’interface ; aucune migration ni publication automatique en production dans la CI.
- Ne jamais inclure de conducteurs réels, données étudiantes, profils opérateur ou clés privées.
- Préciser les essais réellement réalisés sur les appareils et les limites des simulations.

Dépôt : https://github.com/DrAbgrall/conduite-radio. Les contributions sont distribuées sous la licence AGPL-3.0 du projet.
