# 0008 — Migrations appliquées au projet distant, sans Docker

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Contexte
Pas de Docker ni de base locale : les migrations s'appliquent directement au projet `prpcafqjcedrrluglqpl`. Le poste de développement n'a pas d'IPv6, donc la connexion directe `db.<ref>.supabase.co` échoue.

## Choix
- **CLI Supabase** installée en dépendance de développement (`npx supabase`).
- Connexion par le **pooler en mode session** (`aws-0-eu-west-2.pooler.supabase.com:5432`, utilisateur `postgres.<ref>`). L'URL est construite par `scripts/lib/env.ts` à partir de `SUPABASE_DB_PASSWORD` (encodé), sans jamais être affichée ni écrite sur disque.
- Commandes :
  - `pnpm db:push --dry-run` puis `pnpm db:push` : applique `supabase/migrations/` ;
  - `pnpm db:status` : migrations appliquées / en attente ;
  - `pnpm db:types` : régénère `src/shared/supabase/database.types.ts` (via le jeton personnel).
- Une migration appliquée ne se modifie jamais : on en écrit une nouvelle.
- Toute opération destructrice (drop de table ou de colonne, truncate, suppression de données) est soumise à l'accord du propriétaire du produit avant application.
- Les tests RLS utilisent la même connexion, dans des transactions annulées.
