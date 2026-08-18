# Documentation — photo-template

Ce dossier documente le **fonctionnement** de l'application (ce qu'elle fait et comment,
côté UI et côté moteur Rust). Pour les commandes de build/test/lint, voir
`.junie/guidelines.md` à la racine (déjà à jour) et `AGENTS.md`.

> ⚠️ Ce n'est **pas** un projet Symfony/PHP. Il n'y a ni `composer.json` ni code PHP dans
> ce dépôt. Il s'agit d'une application **desktop Tauri 2** avec :
> - un frontend **React 18 + TypeScript + Vite** (`src/`)
> - un backend **Rust** embarqué (`src-tauri/`) qui expose des commandes Tauri
>   (`invoke(...)`) et pilote une base **SQLite** via **Diesel**.

## Sommaire

- [fonctionnalites.md](./fonctionnalites.md) — ce que fait l'application, du point de vue utilisateur.
- [architecture.md](./architecture.md) — comment c'est construit : flux de données, modules, schéma DB, commandes Tauri.
- [known-issues.md](./known-issues.md) — dette technique et pièges identifiés pendant l'exploration.
- [roadmap.md](./roadmap.md) — améliorations orientées utilisateur, organisées en phases.
- [build-windows.md](./build-windows.md) — comment builder un installeur Windows (.msi/.exe) pour distribution client.
