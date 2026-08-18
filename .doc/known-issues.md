# Dette technique & points d'attention

Constats faits pendant l'exploration du code (pas des bugs signalés par l'utilisateur —
à vérifier/prioriser avant d'agir dessus).

## Zone Numéro non rendue en texte

`add_text_overlay` (`src-tauri/src/lib.rs`) ne dessine **pas** le numéro en texte : elle
peint un rectangle noir semi-transparent à l'emplacement estimé du texte
(`Rgba([0,0,0,150])`), avec un commentaire `// TODO: Replace with proper font rendering
when font files are available`. Les dépendances `imageproc` et `rusttype` sont déclarées
dans `Cargo.toml` mais ne sont importées/utilisées nulle part. Le dossier
`src-tauri/fonts/` existe mais est vide.
→ Si une évolution demande "afficher le vrai numéro", c'est le point d'entrée.

## Chemin de la base SQLite relatif au CWD

`establish_connection()` utilise l'URL fixe `"sqlite://photo_template.db"`, un chemin
**relatif**. Le fichier `.db` se retrouve donc créé dans le répertoire de travail courant
du process (d'où la présence de `src-tauri/photo_template.db` en `dev`), et non dans
`app_data_dir()` comme le sont `template_images/` et `generated_images/`. En build/release
sur une autre plateforme, le CWD au lancement peut différer et faire échouer/dupliquer la
base. À corriger en pointant vers `app_handle.path().app_data_dir()` si on touche à cette
zone.

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

## Pas de tests automatisés présents

`src-tauri/tests/` existe mais est vide. `.junie/guidelines.md` documente comment lancer
des tests Rust (`cargo test`) et suggère Vitest pour le frontend, mais rien n'est
implémenté à ce jour.

## Extraction du numéro par regex générique

`extract_number_from_filename` prend la **première** séquence de chiffres trouvée dans
le nom de fichier (regex `[0-9]+`), pas nécessairement le "numéro de dossard/photo"
voulu si le nom de fichier contient d'autres chiffres (date, résolution, etc.). Repli sur
l'index de traitement (ordre alphabétique du tri de fichiers) si aucun chiffre trouvé.
