# AGENTS.md

Guide rapide pour tout agent (Claude Code, etc.) travaillant sur ce dépôt.

## Le projet en une phrase

Application desktop **Tauri 2** (React 18 + TypeScript + Vite pour l'UI, Rust + Diesel/
SQLite pour le backend) qui permet de créer des templates photo (image + 2 zones de
recadrage dessinées à la souris) puis de générer en masse des images composées à partir
d'un dossier source, packagées en ZIP.

**Ce n'est pas un projet Symfony/PHP** : il n'y a aucun code PHP ni `composer.json` dans
ce dépôt.

## Où trouver quoi

- `.doc/fonctionnalites.md` — ce que fait l'appli côté utilisateur (les 3 écrans, le
  pipeline de génération, le modèle de données).
- `.doc/architecture.md` — comment c'est câblé : commandes Tauri, fichiers Rust/React,
  pipeline de traitement d'image, accès DB.
- `.doc/known-issues.md` — dette technique connue (zone "numéro" pas rendue en vrai
  texte, chemin DB relatif au CWD, plugin sql inutilisé, etc.) — à lire avant de toucher
  à ces zones pour ne pas re-découvrir les mêmes pièges.
- `.junie/guidelines.md` — commandes de build/dev/test déjà documentées en détail
  (`yarn dev`, `yarn build`, `cargo test --manifest-path src-tauri/Cargo.toml`, etc.).
  Ne pas dupliquer ce contenu ici, s'y référer.

## Structure du code

```
src/                          Frontend React (Vite)
  App.tsx                     State machine des vues (list/create/edit/generate) + logique du formulaire + canvas de recadrage
  components/TemplateListView.tsx        Vue liste (présentation)
  components/TemplateGenerationView.tsx  Vue génération (présentation)
  types/photoTemplate.ts      Type partagé, miroir du modèle Rust

src-tauri/src/                Backend Rust (crate lib photo_template_lib)
  lib.rs                      Toutes les commandes Tauri + logique métier (DB, images, zip)
  main.rs                     Point d'entrée, délègue à lib::run()
  models.rs                   Structs Diesel (PhotoTemplate, NewPhotoTemplate)
  schema.rs                   Schéma Diesel généré
src-tauri/migrations/         Migrations Diesel (une seule : table photo_templates)
src-tauri/capabilities/       ACL Tauri 2 (permissions de la fenêtre)
```

## Conventions observées à respecter

- **Logique métier côté Rust dans le crate lib**, pas dans `main.rs` (déjà la convention
  ici — cf. `.junie/guidelines.md`).
- **Vues frontend en composants séparés et "présentation pure"** (props uniquement, pas
  d'appel `invoke` direct) — pattern suivi par `TemplateListView` et
  `TemplateGenerationView`. Le formulaire create/edit dans `App.tsx` n'a pas encore été
  extrait ainsi (dette connue, voir known-issues.md) ; si vous le faites, suivez le même
  pattern.
- **Nommage des commandes Tauri** : `invoke("snake_case_name", { camelCaseArg })` — Tauri
  convertit automatiquement `camelCase` (JS) ↔ `snake_case` (Rust) pour les arguments.
- Toute nouvelle permission/API Tauri doit être déclarée dans
  `src-tauri/capabilities/default.json`, sinon erreur au runtime malgré une compilation
  OK.
- Les coordonnées de recadrage sont stockées en base comme **chaînes JSON** (`{x, y,
  width, height}`) dans des colonnes `TEXT`, pas en colonnes numériques dédiées.

## Avant de modifier le pipeline de génération d'images ou le stockage

Lire `.doc/known-issues.md` en premier — plusieurs limitations non évidentes à la
lecture rapide du code y sont détaillées (rendu du numéro, chemin de la DB, plugin sql
inutilisé).

## Commandes essentielles

```bash
yarn dev                                          # dev frontend (Vite)
yarn tauri dev                                    # dev complet (frontend + Rust)
yarn build                                        # build frontend (tsc + vite build)
cargo test --manifest-path src-tauri/Cargo.toml   # tests Rust
yarn tauri build                                  # packaging natif
```

Détails complets (prérequis plateforme, lint, matrice de versions) : voir
`.junie/guidelines.md`.

## Build Windows pour distribution client

Ne pas cross-compiler depuis Linux/Docker (fragile, non supporté officiellement par
Tauri, impossible à tester avant diffusion). Utiliser le workflow CI
`.github/workflows/build-windows.yml` (runner `windows-latest`, déclenchable
manuellement ou sur tag `v*`) ou builder directement sur une machine Windows. Détails :
`.doc/build-windows.md`.
