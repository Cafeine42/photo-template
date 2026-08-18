# Dette technique & points d'attention

Constats faits pendant l'exploration du code (pas des bugs signalés par l'utilisateur —
à vérifier/prioriser avant d'agir dessus).

## ~~Zone Numéro non rendue en texte~~ (résolu — roadmap Phase 1)

~~`add_text_overlay` ne dessinait pas le numéro en texte~~. Résolu : le texte est
maintenant rendu avec la police DejaVu Sans embarquée (`src-tauri/fonts/DejaVuSans.ttf`,
`imageproc::drawing::draw_text_mut`), avec ajustement automatique de la taille pour
tenir dans la zone de recadrage.

## ~~Chemin de la base SQLite relatif au CWD~~ (résolu)

~~`establish_connection()` utilisait l'URL fixe `"sqlite://photo_template.db"`, un chemin
relatif~~. Résolu : `establish_connection(&app_handle)` ouvre désormais la base dans
`app_handle.path().app_data_dir()` (fonction `database_path`), comme `template_images/`
et `generated_images/`. Les migrations tournent dans un hook `.setup()` du builder Tauri
(nécessaire pour disposer d'un `AppHandle`), plus avant sa construction. Ce point était
un **bloquant réel** pour la distribution Windows via `.msi` : une installation par
défaut dans `C:\Program Files\...` n'est pas accessible en écriture pour un utilisateur
standard, ce qui aurait fait planter l'app au lancement chez tout client non-admin.

## Pas de pool de connexions / pas de state Tauri

Chaque commande ouvre sa propre `SqliteConnection` via `establish_connection()`. Pas de
`tauri::State` partagé, pas de pool (`r2d2` ou équivalent). Fonctionnel pour une appli
mono-utilisateur locale, mais à garder en tête si des accès concurrents apparaissent
(ex. génération + édition simultanées).

## `tauri-plugin-sql` déclaré mais inutilisé

Le plugin est initialisé (`tauri_plugin_sql::Builder::default().build()`), présent dans
`Cargo.toml` et dans `capabilities/default.json` (`sql:default`), mais aucun code
(Rust ou frontend) ne l'utilise réellement — tous les accès DB passent par Diesel en
direct dans les commandes. Un candidat à retirer si non prévu pour un usage futur.

## CSP désactivée

`tauri.conf.json` → `app.security.csp: null`. Aucune Content-Security-Policy n'est
appliquée à la webview. À revisiter avant toute distribution publique de l'app.

## Formulaire création/édition non extrait en composant

Contrairement à `TemplateListView` et `TemplateGenerationView` (extraits récemment,
cf. commit `d86071e`), le formulaire de création/édition (avec toute la logique de
dessin sur `<canvas>`) vit encore intégralement dans `App.tsx`. Une extraction en
`TemplateFormView` (ou équivalent) suivrait le pattern déjà en place.

## ~~Pas de tests automatisés présents~~ (partiellement résolu)

Côté Rust : résolu — `src-tauri/src/lib.rs` contient un module `#[cfg(test)]` avec des
tests unitaires (CRUD, extraction de numéro, traitement d'image, archive ZIP,
historique de générations). `src-tauri/tests/` (tests d'intégration) reste vide.
Côté frontend : toujours aucun test (pas de Vitest configuré) — `.junie/guidelines.md`
documente comment l'ajouter si besoin.

## Extraction du numéro par regex générique

`extract_number_from_filename` prend la **première** séquence de chiffres trouvée dans
le nom de fichier (regex `[0-9]+`), pas nécessairement le "numéro de dossard/photo"
voulu si le nom de fichier contient d'autres chiffres (date, résolution, etc.). Repli sur
l'index de traitement (ordre alphabétique du tri de fichiers) si aucun chiffre trouvé.
