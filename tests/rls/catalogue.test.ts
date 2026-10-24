// Méta-tests : couvrent automatiquement toute table ajoutée au schéma public.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, scenario } from "./harness";

beforeAll(connect);
afterAll(disconnect);

// Tables où authenticated peut supprimer des lignes (aucune à ce jour : on archive ou on révoque).
const DELETE_ALLOWED = new Set<string>();

describe("catalogue Postgres", () => {
  it("la RLS est activée sur toutes les tables de public", () =>
    scenario(async (ctx) => {
      const rows = await ctx.rows<{ table: string }>(
        `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
      );
      expect(rows).toEqual([]);
    }));

  it("chaque table de public a au moins une politique", () =>
    scenario(async (ctx) => {
      const rows = await ctx.rows<{ table: string }>(
        `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)`,
      );
      expect(rows).toEqual([]);
    }));

  it("anon n'a aucun droit sur les tables, vues et fonctions de public", () =>
    scenario(async (ctx) => {
      const tables = await ctx.rows<{ name: string }>(
        `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
           and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
             or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`,
      );
      expect(tables).toEqual([]);
      const functions = await ctx.rows<{ name: string }>(
        `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`,
      );
      expect(functions).toEqual([]);
    }));

  it("authenticated ne peut ni supprimer ni vider une table, sauf exception listée", () =>
    scenario(async (ctx) => {
      const rows = await ctx.rows<{ name: string }>(
        `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and (has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate'))`,
      );
      expect(rows.map((r) => r.name).filter((name) => !DELETE_ALLOWED.has(name))).toEqual([]);
    }));

  it("les fonctions security definer fixent leur search_path", () =>
    scenario(async (ctx) => {
      const rows = await ctx.rows<{ name: string }>(
        `select n.nspname || '.' || p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.prosecdef
           and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
      );
      expect(rows).toEqual([]);
    }));
});
