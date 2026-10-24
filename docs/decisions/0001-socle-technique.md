# 0001 — Socle technique

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Contexte
CLAUDE.md impose Next.js + Tailwind + Supabase + Vercel. Restent à choisir : versions, gestionnaire de paquets, outils de test et de qualité, organisation du code.

## Choix
- **Next.js 16.4** (App Router, Turbopack), React 19.3, TypeScript 5.9 strict. TypeScript 7 (réécriture native) est disponible mais trop récent pour l'écosystème (eslint, types Next) : on reste en 5.x.
- **pnpm 11** : installations rapides, et il bloque par défaut les scripts d'installation des dépendances (liste blanche dans `pnpm-workspace.yaml`).
- **Tailwind CSS 4** avec jetons dans `@theme` (couleurs, rayons) : mode sombre possible plus tard en redéfinissant les variables.
- **Vitest** : deux projets, `domain` (règles métier pures, sans réseau) et `rls` (isolation sur la base distante, voir 0004).
- **Playwright** : captures responsive 360 / 768 / 1280 px et parcours de bout en bout.
- **Zod** pour la validation des entrées serveur.

## Organisation du code
```
src/app/                routes Next.js (minces : composent les modules)
src/modules/<module>/   un dossier par domaine métier (auth-accounts, shops, i18n, …)
  domain/               règles pures, testées, sans React / Next / Supabase
  data/ server/ ui/     adaptateurs et composants
  index.ts              interface publique (utilisable partout)
  server.ts             interface publique côté serveur uniquement (import "server-only")
src/shared/             domain/ (montants, quantités, téléphone), ui/ (design system), supabase/ (clients)
supabase/migrations/    migrations versionnées
tests/rls/              tests d'isolation
scripts/                outillage (base, admin, secrets)
```
Règles vérifiées par ESLint : pas d'import des fichiers internes d'un autre module ; le domaine n'importe ni React, ni Next, ni Supabase ; pas de texte en dur dans le JSX.

Convention : identifiants et noms de fichiers en anglais, interface, documentation et commits en français.
