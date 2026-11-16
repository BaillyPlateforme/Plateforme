# La batterie de tests de la plateforme Bailly

Tout tester de A à Z, en une commande :

```
cd tests
npm install          # la première fois (Vitest et Playwright, dans tests/ seulement)
node lanceur.mjs     # tous les niveaux, puis le rapport resultats/RAPPORT.md
```

Le dossier `tests/` a son propre `package.json` et son propre fichier de verrouillage, hors des espaces de
travail npm : il ne touche ni au verrou de la racine ni au build Railway.

## Les niveaux

| Niveau | Outil | Ce qu'il vérifie | Écrit ? |
|---|---|---|---|
| `statique` | tsc, eslint, npm audit | types des deux apps, règles du code, failles connues des dépendances | non |
| `build` | next build | les deux apps se construisent | non |
| `unitaires` | Vitest | la logique pure : tarification, estimation, schémas, limites, jetons, envois, Créagidem, paiement, espace client, CRM | non (aucune clé, aucun réseau) |
| `base` | Vitest + pg | les deux projets Supabase : inscriptions fermées, RLS partout, clé publique sans aucun accès, fonctions, seaux, registre des migrations, cohérence des données | recette seulement (essais d'écriture anonyme, tous refusés) ; production en **lecture seule** |
| `local` | Playwright | toute l'API et tous les parcours dans un vrai navigateur (bureau et mobile), sur les deux apps lancées ici et branchées sur la recette | oui, en recette : données fictives `batterie.…@example.com`, **toutes effacées à la fin** |
| `recette` | Playwright | les services déployés de la recette, tests marqués `@lecture` | non |
| `prod` | Playwright | la production, tests marqués `@lecture`, sans aucun compte | non |

Choisir : `node lanceur.mjs --niveaux unitaires,base` ou `node lanceur.mjs --sans prod`.

## Ce qui ne peut pas sortir

Les apps lancées pour la batterie (`outils/serveurs.mjs`) tournent avec `ENVOI_MODE=desactive` (rien ne part,
tout est journalisé), `CREAGIDEM_MODE=inactif` sans aucun accès Créagidem, des clés Brevo et Gemini
invalides (Gemini se rallume avec `AVEC_GEMINI=1`), et des secrets tirés au hasard pour chaque passage.
Les tests unitaires tournent sans aucune clé. En production, la batterie n'a que la clé publique et une
connexion Postgres en lecture seule ; elle n'y crée aucun compte.

Les clés sont lues à l'exécution dans les fichiers déjà exclus de Git (`apps/interne/.env.local` pour la
recette, `Clés` pour la production) ; rien n'est écrit dans le dépôt. Les mots de passe des comptes de test
sont tirés à chaque passage et gardés dans `tests/.etat/` (exclu de Git).

## Les comptes de test (recette)

Un compte de chaque sorte, créé avant les niveaux API et parcours et effacé après : `equipe` (membre de
l'équipe), `intrus` (sans rôle, hors équipe), `inconnu` (rôle inconnu), `rh` (espace Carrefour), `client`,
`terrain` (identifiant `batterie.terrain`). Seul le compte `equipe` reste ensuite, désactivé et banni, pour
ne pas casser l'historique du CRM qui le cite.

## Les défauts connus

Un test qui révèle un défaut de l'application est gardé, marqué `// BOGUE : …` et passé en « échec
attendu » (`test.fail` dans Playwright, `it.fails` dans Vitest). Il tourne à chaque passage ; le jour où le
défaut est corrigé, il « réussit de façon inattendue » et la batterie le signale : il suffit alors d'ôter
la marque. Le rapport les liste tous.

## Mettre au point un test

```
node construire.mjs                    # construire les deux apps pour la batterie
node outils/serveurs.mjs --lancer      # les lancer et les laisser tourner (autre terminal)
PARTAGE=1 npx playwright test --project=api api/public-demandes
npx vitest run --project unitaires unitaires/commun/calculs
```

`PARTAGE=1` réutilise les serveurs et les comptes déjà prêts, sans rien effacer : plusieurs passages
peuvent tourner en même temps. Le passage complet (`node lanceur.mjs`) remet tout à neuf et nettoie.

## Ajouter un test

- `unitaires/commun/…` ou `unitaires/interne/…` : `*.test.ts`, alias `@/lib`, `@/components`, `@/` comme
  dans les apps.
- `api/…` ou `parcours/…` : `*.spec.ts`, avec `outils/banc.ts` (adresses des apps, sessions des comptes,
  `emailUnique()`, `ipNeuve()`, `surveiller(page)`).
- Une nouvelle route ou une nouvelle page est testée d'office par la matrice des accès
  (`api/securite-acces.spec.ts`) et le parcours de toutes les pages du CRM (`parcours/crm-pages.spec.ts`) :
  l'inventaire est lu dans le code à chaque passage.
