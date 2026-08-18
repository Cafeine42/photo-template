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
| `App.tsx` | Composant racine et **state machine** de l'UI : gère un `currentMode` (`list \| create \| edit \| generate \| history`) et bascule entre les vues. Contient toute la logique métier frontend (formulaire, dessin des zones de recadrage sur `<canvas>`, appels `invoke`, écoute de l'évènement de progression). |
| `components/TemplateListView.tsx` | Vue liste (présentation pure, reçoit tout par props), avec vignette du template. |
| `components/TemplateGenerationView.tsx` | Vue de génération : sélection template + dossier source/sortie, aperçu du dossier (numéros détectés modifiables, avertissement sous-dossiers), aperçu visuel avant génération, barre de progression, annulation, téléchargement. |
| `components/HistoryView.tsx` | Historique des générations passées, avec bouton pour rouvrir le dossier de résultat. |
| `components/Toast.tsx` | Message d'erreur/succès global, position fixe, disparition automatique. |
| `components/ConfirmDialog.tsx` | Boîte de confirmation générique (utilisée pour la suppression de template). |
| `types/photoTemplate.ts` | Type `PhotoTemplate` partagé, miroir du modèle Rust `models::PhotoTemplate`. |
| `types/generation.ts` | Types `GenerationPreparation`, `GenerationEntryPreview`, `GenerationHistoryEntry`, miroirs des structures Rust retournées par les commandes de génération. |

Le formulaire de création/édition n'a **pas** été extrait en composant séparé (contrairement
aux autres vues) — il vit toujours directement dans `App.tsx`, avec toute la logique
d'édition des zones de recadrage : dessin, déplacement et redimensionnement via poignées
(`handleMouseDown/Move/Up`, `getHandleAt`, `resizeRect`, `drawCropRect`), zoom
(`zoomLevel`, transform CSS sur `.crop-stage`), et ajustement par champs numériques
(`updateActiveRectField`). Les coordonnées souris sont converties en coordonnées canvas
via `getCanvasPoint` (ratio `canvas.width / rect.width`), ce qui rend le mapping correct
quel que soit le niveau de zoom appliqué.

## Backend Rust (`src-tauri/src/`)

Crate lib `photo_template_lib` (voir `Cargo.toml` : `name = "photo_template_lib"`),
appelée depuis `main.rs` via `photo_template_lib::run()`.

| Fichier | Rôle |
|---|---|
| `main.rs` | Point d'entrée binaire, délègue tout à `lib::run()`. |
| `lib.rs` | Contient **toutes** les commandes Tauri et la logique métier (accès DB, traitement d'images, zip). Pas de découpage en modules pour l'instant. |
| `models.rs` | Structs Diesel `PhotoTemplate`/`NewPhotoTemplate` et `GenerationHistoryEntry`/`NewGenerationHistoryEntry` (Queryable/Insertable). |
| `schema.rs` | Schéma généré par Diesel CLI (tables `photo_templates` et `generation_history`). |
| `migrations/` | Migrations Diesel : création de `photo_templates`, ajout de `generation_history`, puis ajout de la colonne `category` à `photo_templates`. |
| `capabilities/default.json` | Permissions Tauri 2 (ACL) pour la fenêtre `main` : `core:default`, `opener:default`, `sql:default`, `dialog:default`. |
| `fonts/DejaVuSans.ttf` | Police embarquée (`include_bytes!`) utilisée pour dessiner le numéro sur les images générées. |

### Commandes Tauri exposées (`invoke_handler`)

| Commande | Entrée | Sortie | Description |
|---|---|---|---|
| `greet` | `name` | `String` | Commande de démo du template Tauri, non utilisée par l'UI. |
| `add_photo_template` | name, crop_photo, crop_number, template_img, category | `PhotoTemplate` | Insère un template puis relit la ligne via `last_insert_rowid()`. |
| `get_photo_templates` | — | `Vec<PhotoTemplate>` | Liste tous les templates. |
| `update_photo_template` | id + champs | `PhotoTemplate` | Met à jour un template. |
| `delete_photo_template` | id | `String` | Supprime un template. |
| `save_template_image` | file_data (bytes), filename | `String` (chemin) | Écrit l'image uploadée dans `app_data_dir/template_images/`. |
| `select_image_folder` | — | `String` (chemin) | Ouvre un sélecteur de dossier natif (`tauri-plugin-dialog`), via un canal `tokio::oneshot` pour attendre le callback. |
| `select_output_folder` | — | `String` (chemin) | Même mécanisme que `select_image_folder`, factorisé via `pick_folder_dialog`, pour choisir le dossier de sortie de la génération. |
| `prepare_generation` | image_folder_path | `{ entries: [{key, file_name, extracted_number}], skipped_subfolder_image_count }` | Analyse le dossier source sans traiter les images : liste les fichiers + numéro détecté par fichier, et compte les images ignorées car situées dans des sous-dossiers. |
| `preview_generation_image` | template_id, image_folder_path, number_overrides? | `String` (data URL PNG base64) | Compose le rendu de la **première** image du dossier avec le template, pour aperçu avant traitement complet. |
| `generate_images_with_template` | template_id, image_folder_path, output_folder_path?, number_overrides?, output_format? ("jpeg"\|"png"), jpeg_quality? (1-100) | `String` (chemin du zip) | Pipeline complet de génération (voir `fonctionnalites.md`). Émet l'évènement `generation-progress` (0–100), vérifie `GenerationCancelFlag` à chaque image, enregistre l'exécution dans `generation_history`. |
| `cancel_generation` | — | — | Positionne `GenerationCancelFlag` à `true` ; la génération en cours s'arrête au prochain contrôle (avant l'image suivante). |
| `get_generation_history` | — | `Vec<GenerationHistoryEntry>` | Liste l'historique des générations, plus récentes en premier. |
| `download_archive` | archive_path | — | Ouvre le dossier parent de l'archive dans l'explorateur système (`tauri-plugin-opener`). Réutilisé par l'historique pour rouvrir une génération passée. |

### État partagé Tauri

- `GenerationCancelFlag` (`AtomicBool` géré via `.manage(...)`) : seul état partagé du
  process. Remis à `false` au début de chaque `generate_images_with_template`, positionné
  à `true` par `cancel_generation`. Pas de pool de connexions DB (voir known-issues.md).

### Pipeline de génération d'image (dans `lib.rs`)

`generate_images_with_template` orchestre des fonctions utilitaires privées, réutilisées
aussi par `prepare_generation`/`preview_generation_image` :

1. `load_image` — charge l'image du template.
2. `find_image_files` — liste les fichiers image du dossier source (profondeur 1, extensions filtrées).
3. `count_images_in_subfolders` — compte les images ignorées en profondeur ≥ 2, pour avertir l'utilisateur.
4. Pour chaque image :
   - `load_and_resize_image` — redimensionne en conservant le ratio (Lanczos3) pour tenir dans la zone "Photo".
   - `extract_number_from_filename` — regex `[0-9]+` sur le nom de fichier, sinon index+1 (sauf override utilisateur via `number_overrides`, clé = nom de fichier sans extension).
   - `composite_images_with_text` → `composite_images` (overlay centré de la photo sur le template) puis `add_text_overlay` (rendu du texte via `imageproc`/`rusttype` et la police embarquée).
5. `create_archive` — zip (Deflate) de toutes les images traitées.
6. `record_generation_history_impl` — insère une ligne dans `generation_history` (best-effort : n'échoue pas la génération si l'écriture échoue).

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
- `imageproc`, `rusttype` — rendu du texte du numéro sur l'image générée.
- `base64` — encodage de l'aperçu (PNG) en data URL pour l'affichage direct côté frontend.
- `zip` — création de l'archive de sortie.
- `walkdir` — parcours du dossier source.
- `regex` — extraction du numéro dans le nom de fichier.
- `tauri-plugin-dialog` — sélecteur de dossier natif (source et sortie).
- `tauri-plugin-opener` — ouverture du dossier de résultat dans l'explorateur système.
- `tokio` (feature `sync`) — uniquement pour le canal `oneshot` du sélecteur de dossier.
- `chrono` — horodatage (RFC 3339) des entrées de l'historique de générations.

## Configuration Tauri (`tauri.conf.json`)

- Fenêtre unique `main`, 1280×860 par défaut (minimum 900×600), redimensionnable.
- `security.csp: null` — pas de Content-Security-Policy définie (voir known-issues.md).
- `beforeDevCommand` / `beforeBuildCommand` pointent vers `yarn dev` / `yarn build`,
  `frontendDist: ../dist`.

## Build / test / lint

Déjà documenté en détail dans `.junie/guidelines.md` (commandes `yarn dev`,
`yarn build`, `cargo test --manifest-path src-tauri/Cargo.toml`, etc.). Ce fichier n'est
pas dupliqué ici ; `AGENTS.md` y renvoie directement.
