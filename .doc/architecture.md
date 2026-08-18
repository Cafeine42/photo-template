# Architecture technique

## Vue d'ensemble

```
┌───────────────────────────┐        invoke("...")         ┌───────────────────────────────┐
│  Frontend (React + Vite)  │ ─────────────────────────────▶│  Backend Rust (photo_template_lib) │
│  src/                     │◀───────────────────────────── │  src-tauri/src/                │
│                           │   listen("generation-progress")│                               │
└───────────────────────────┘                                └───────────────┬───────────────┘
                                                                              │ Diesel ORM
                                                                              ▼
                                                                  SQLite (photo_template.db)
```

- Communication frontend ↔ backend exclusivement via les **commandes Tauri**
  (`@tauri-apps/api/core.invoke`) et un **évènement** (`@tauri-apps/api/event.listen`)
  pour la progression.
- Pas d'API HTTP, pas de serveur : tout tourne dans le process desktop.

## Frontend (`src/`)

| Fichier | Rôle |
|---|---|
| `main.tsx` | Point d'entrée React (mount du composant `App`). |
| `App.tsx` | Composant racine et **state machine** de l'UI : gère un `currentMode` (`list \| create \| edit \| generate`) et bascule entre les 3 vues. Contient toute la logique métier frontend (formulaire, dessin des zones de recadrage sur `<canvas>`, appels `invoke`, écoute de l'évènement de progression). |
| `components/TemplateListView.tsx` | Vue liste (présentation pure, reçoit tout par props). |
| `components/TemplateGenerationView.tsx` | Vue de génération (sélection template + dossier, barre de progression, téléchargement). |
| `types/photoTemplate.ts` | Type `PhotoTemplate` partagé, miroir du modèle Rust `models::PhotoTemplate`. |

Le formulaire de création/édition n'a **pas** été extrait en composant séparé (contrairement
aux deux autres vues) — il vit toujours directement dans `App.tsx` (~250 lignes), avec toute
la logique de dessin sur canvas (`handleMouseDown/Move/Up`, `drawCropRect`).

## Backend Rust (`src-tauri/src/`)

Crate lib `photo_template_lib` (voir `Cargo.toml` : `name = "photo_template_lib"`),
appelée depuis `main.rs` via `photo_template_lib::run()`.

| Fichier | Rôle |
|---|---|
| `main.rs` | Point d'entrée binaire, délègue tout à `lib::run()`. |
| `lib.rs` | Contient **toutes** les commandes Tauri et la logique métier (accès DB, traitement d'images, zip). Pas de découpage en modules pour l'instant. |
| `models.rs` | Structs Diesel `PhotoTemplate` (Queryable) et `NewPhotoTemplate` (Insertable). |
| `schema.rs` | Schéma généré par Diesel CLI (table `photo_templates`). |
| `migrations/` | Migration Diesel unique : création de la table `photo_templates`. |
| `capabilities/default.json` | Permissions Tauri 2 (ACL) pour la fenêtre `main` : `core:default`, `opener:default`, `sql:default`, `dialog:default`. |

### Commandes Tauri exposées (`invoke_handler`)

| Commande | Entrée | Sortie | Description |
|---|---|---|---|
| `greet` | `name` | `String` | Commande de démo du template Tauri, non utilisée par l'UI. |
| `add_photo_template` | name, crop_photo, crop_number, template_img | `PhotoTemplate` | Insère un template puis relit la ligne via `last_insert_rowid()`. |
| `get_photo_templates` | — | `Vec<PhotoTemplate>` | Liste tous les templates. |
| `update_photo_template` | id + champs | `PhotoTemplate` | Met à jour un template. |
| `delete_photo_template` | id | `String` | Supprime un template. |
| `save_template_image` | file_data (bytes), filename | `String` (chemin) | Écrit l'image uploadée dans `app_data_dir/template_images/`. |
| `select_image_folder` | — | `String` (chemin) | Ouvre un sélecteur de dossier natif (`tauri-plugin-dialog`), via un canal `tokio::oneshot` pour attendre le callback. |
| `generate_images_with_template` | template_id, image_folder_path | `String` (chemin du zip) | Pipeline complet de génération (voir `fonctionnalites.md`). Émet l'évènement `generation-progress` (0–100) pendant le traitement. |
| `download_archive` | archive_path | — | Ouvre le dossier parent de l'archive dans l'explorateur système (`tauri-plugin-opener`). |

### Pipeline de génération d'image (dans `lib.rs`)

`generate_images_with_template` orchestre des fonctions utilitaires privées :

1. `load_image` — charge l'image du template.
2. `find_image_files` — liste les fichiers image du dossier source (profondeur 1, extensions filtrées).
3. Pour chaque image :
   - `load_and_resize_image` — redimensionne en conservant le ratio (Lanczos3) pour tenir dans la zone "Photo".
   - `extract_number_from_filename` — regex `[0-9]+` sur le nom de fichier, sinon index+1.
   - `composite_images_with_text` → `composite_images` (overlay centré de la photo sur le template) puis `add_text_overlay` (voir limite dans known-issues.md).
4. `create_archive` — zip (Deflate) de toutes les images traitées.

### Accès base de données

- `establish_connection()` ouvre **une nouvelle connexion SQLite à chaque appel de
  commande** (pas de pool, pas de state Tauri partagé) vers l'URL fixe
  `sqlite://photo_template.db` (chemin **relatif** au répertoire de travail courant du
  process — voir known-issues.md).
- Les migrations Diesel (`MIGRATIONS`, `embed_migrations!()`) sont exécutées au démarrage
  dans `run()`, avant même l'initialisation du `tauri::Builder`.
- Le plugin `tauri-plugin-sql` (feature `sqlite`) est déclaré en dépendance et dans les
  capabilities, mais **n'est pas utilisé** dans le code Rust ni dans le frontend : tous
  les accès DB passent par Diesel directement dans les commandes `#[tauri::command]`.

### Dépendances Rust notables (`Cargo.toml`)

- `diesel` + `diesel_migrations` (SQLite) — ORM et migrations.
- `image` — décodage/redimensionnement/composition d'images.
- `imageproc`, `rusttype` — présentes pour du rendu de texte/formes avancé, mais **non
  utilisées actuellement** (voir known-issues.md).
- `zip` — création de l'archive de sortie.
- `walkdir` — parcours du dossier source.
- `regex` — extraction du numéro dans le nom de fichier.
- `tauri-plugin-dialog` — sélecteur de dossier natif.
- `tauri-plugin-opener` — ouverture du dossier de résultat dans l'explorateur système.
- `tokio` (feature `sync`) — uniquement pour le canal `oneshot` du sélecteur de dossier.

## Configuration Tauri (`tauri.conf.json`)

- Fenêtre unique `main`, 800×600.
- `security.csp: null` — pas de Content-Security-Policy définie (voir known-issues.md).
- `beforeDevCommand` / `beforeBuildCommand` pointent vers `yarn dev` / `yarn build`,
  `frontendDist: ../dist`.

## Build / test / lint

Déjà documenté en détail dans `.junie/guidelines.md` (commandes `yarn dev`,
`yarn build`, `cargo test --manifest-path src-tauri/Cargo.toml`, etc.). Ce fichier n'est
pas dupliqué ici ; `AGENTS.md` y renvoie directement.
