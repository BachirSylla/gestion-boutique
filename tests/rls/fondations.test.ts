// Isolation des données (invariant 4) : propriétaires, boutiques, utilisateurs, rattachements.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, scenario, seedWorld, sorted } from "./harness";

beforeAll(connect);
afterAll(disconnect);

describe("tenants", () => {
  it("chaque utilisateur ne voit que son propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      for (const user of [w.ownerA, w.managerA1, w.accountantA]) {
        await ctx.as(user);
        expect(await ctx.ids("select id from public.tenants")).toEqual([w.tenantA]);
      }
      await ctx.as(w.ownerB);
      expect(await ctx.ids("select id from public.tenants")).toEqual([w.tenantB]);
    }));

  it("l'admin plateforme voit tous les propriétaires", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.admin);
      const ids = await ctx.ids("select id from public.tenants where id = any($1)", [[w.tenantA, w.tenantB]]);
      expect(ids).toEqual(sorted(w.tenantA, w.tenantB));
    }));

  it("personne ne crée ni ne modifie un propriétaire depuis le client", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      for (const user of [w.ownerA, w.admin]) {
        await ctx.as(user);
        expect((await ctx.tryQuery("insert into public.tenants (name) values ('Pirate')")).error).toMatch(/permission denied/);
        expect((await ctx.tryQuery("update public.tenants set status = 'suspended' where id = $1", [w.tenantA])).error).toMatch(
          /permission denied/,
        );
        expect((await ctx.tryQuery("delete from public.tenants where id = $1", [w.tenantB])).error).toMatch(/permission denied/);
      }
    }));
});

describe("shops", () => {
  it("le propriétaire voit toutes ses boutiques sans rattachement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      expect(await ctx.ids("select id from public.shops")).toEqual(sorted(w.shopA1, w.shopA2));
    }));

  it("un gérant ne sort pas de ses boutiques", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.managerA1);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopA1]);
      await ctx.as(w.accountantA);
      expect(await ctx.ids("select id from public.shops")).toEqual(sorted(w.shopA1, w.shopA2));
      await ctx.as(w.managerB1);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopB1]);
    }));

  it("un rattachement révoqué retire l'accès", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      const revoke = await ctx.tryQuery("update public.shop_members set revoked_at = now() where user_id = $1", [w.managerA1]);
      expect(revoke).toEqual({ error: null, rowCount: 1 });
      await ctx.as(w.managerA1);
      expect(await ctx.ids("select id from public.shops")).toEqual([]);
      await ctx.asSystem();
      const [row] = await ctx.rows<{ revoked_by: string }>("select revoked_by from public.shop_members where user_id = $1", [w.managerA1]);
      expect(row.revoked_by).toBe(w.ownerA);
    }));

  it("le propriétaire crée et modifie ses boutiques, pas celles des autres", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("insert into public.shops (tenant_id, name) values ($1, 'A3')", [w.tenantA])).error).toBeNull();
      expect((await ctx.tryQuery("insert into public.shops (tenant_id, name) values ($1, 'Intrus')", [w.tenantB])).error).toMatch(
        /row-level security/,
      );
      expect(await ctx.tryQuery("update public.shops set name = 'A1 bis' where id = $1", [w.shopA1])).toEqual({ error: null, rowCount: 1 });
      expect(await ctx.tryQuery("update public.shops set name = 'Piraté' where id = $1", [w.shopB1])).toEqual({ error: null, rowCount: 0 });
      expect((await ctx.tryQuery("update public.shops set tenant_id = $1 where id = $2", [w.tenantB, w.shopA1])).error).toMatch(
        /permission denied/,
      );
      expect((await ctx.tryQuery("delete from public.shops where id = $1", [w.shopA1])).error).toMatch(/permission denied/);
    }));

  it("gérant et comptable ne créent ni ne modifient de boutique", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      for (const user of [w.managerA1, w.accountantA]) {
        await ctx.as(user);
        expect((await ctx.tryQuery("insert into public.shops (tenant_id, name) values ($1, 'X')", [w.tenantA])).error).toMatch(
          /row-level security/,
        );
        expect(await ctx.tryQuery("update public.shops set name = 'X' where id = $1", [w.shopA1])).toEqual({ error: null, rowCount: 0 });
      }
    }));

  it("le client ne peut pas usurper l'auteur d'une boutique", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      const spoof = await ctx.tryQuery("insert into public.shops (tenant_id, name, created_by) values ($1, 'A3', $2)", [w.tenantA, w.managerA1]);
      expect(spoof.error).toMatch(/permission denied/);
      const [shop] = await ctx.rows<{ created_by: string }>("insert into public.shops (tenant_id, name) values ($1, 'A3') returning created_by", [
        w.tenantA,
      ]);
      expect(shop.created_by).toBe(w.ownerA);
    }));
});

describe("profiles et contacts", () => {
  it("les membres voient le nom de leurs collègues, jamais ceux d'un autre propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.managerA1);
      const names = (await ctx.rows<{ full_name: string }>("select full_name from public.profiles order by full_name")).map((r) => r.full_name);
      expect(names).toEqual(["Accountant A", "Disabled A", "Manager A1", "Owner A"]);
    }));

  it("le téléphone d'un employé n'est visible que par lui-même et son propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.managerA1);
      expect(await ctx.rows("select user_id from public.profile_contacts")).toEqual([{ user_id: w.managerA1 }]);
      await ctx.as(w.accountantA);
      expect(await ctx.rows("select user_id from public.profile_contacts")).toEqual([{ user_id: w.accountantA }]);
      await ctx.as(w.ownerA);
      const ids = (await ctx.rows<{ user_id: string }>("select user_id from public.profile_contacts")).map((r) => r.user_id).sort();
      expect(ids).toEqual(sorted(w.ownerA, w.managerA1, w.accountantA, w.disabledManagerA));
      await ctx.as(w.ownerB);
      const idsB = (await ctx.rows<{ user_id: string }>("select user_id from public.profile_contacts")).map((r) => r.user_id).sort();
      expect(idsB).toEqual(sorted(w.ownerB, w.managerB1));
    }));

  it("l'admin voit les propriétaires (nom, téléphone), pas les employés", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.admin);
      const scope = [w.ownerA, w.ownerB, w.managerA1, w.accountantA, w.managerB1];
      const profiles = (await ctx.rows<{ user_id: string }>("select user_id from public.profiles where user_id = any($1)", [scope])).map((r) => r.user_id);
      expect(profiles.sort()).toEqual(sorted(w.ownerA, w.ownerB));
      const contacts = (await ctx.rows<{ user_id: string }>("select user_id from public.profile_contacts where user_id = any($1)", [scope])).map(
        (r) => r.user_id,
      );
      expect(contacts.sort()).toEqual(sorted(w.ownerA, w.ownerB));
    }));

  it("personne ne modifie un profil ou son rôle depuis le client", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      for (const user of [w.managerA1, w.ownerA]) {
        await ctx.as(user);
        expect((await ctx.tryQuery("update public.profiles set role = 'owner' where user_id = $1", [w.managerA1])).error).toMatch(/permission denied/);
        expect((await ctx.tryQuery("update public.profile_contacts set phone_e164 = '+221700000000'")).error).toMatch(/permission denied/);
        expect(
          (await ctx.tryQuery("insert into public.profiles (user_id, tenant_id, role, full_name) values ($1, $2, 'owner', 'X')", [w.admin, w.tenantA]))
            .error,
        ).toMatch(/permission denied/);
      }
    }));
});

describe("comptes désactivés et propriétaires suspendus", () => {
  it("un profil désactivé ne voit plus rien d'autre que lui-même", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.disabledManagerA);
      expect(await ctx.rows("select id from public.tenants")).toEqual([]);
      expect(await ctx.rows("select id from public.shops")).toEqual([]);
      expect(await ctx.rows("select id from public.shop_members")).toEqual([]);
      expect(await ctx.rows("select user_id from public.profiles")).toEqual([{ user_id: w.disabledManagerA }]);
    }));

  it("un propriétaire suspendu et ses employés perdent l'accès", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asSystem();
      await ctx.db.query("update public.tenants set status = 'suspended' where id = $1", [w.tenantA]);
      for (const user of [w.ownerA, w.managerA1]) {
        await ctx.as(user);
        expect(await ctx.rows("select id from public.shops")).toEqual([]);
        expect(await ctx.rows("select id from public.tenants")).toEqual([]);
      }
      await ctx.as(w.ownerB);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopB1]);
    }));
});

describe("shop_members", () => {
  it("le propriétaire rattache ses employés à ses boutiques uniquement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [w.shopA2, w.managerA1, w.tenantA])).error).toBeNull();
      // Boutique d'un autre propriétaire : refusé par la RLS.
      expect(
        (await ctx.tryQuery("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [w.shopB1, w.managerA1, w.tenantB])).error,
      ).toMatch(/row-level security/);
      // Mélange de propriétaires : refusé par la clé étrangère composite.
      expect(
        (await ctx.tryQuery("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [w.shopA1, w.managerB1, w.tenantA])).error,
      ).toMatch(/foreign key/);
      // Un propriétaire n'est jamais rattaché.
      expect(
        (await ctx.tryQuery("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [w.shopA1, w.ownerA, w.tenantA])).error,
      ).toMatch(/sans rattachement/);
    }));

  it("même avec la base, on ne rattache pas un employé de B à une boutique de A", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asSystem();
      const result = await ctx.tryQuery("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [
        w.shopA1,
        w.managerB1,
        w.tenantB,
      ]);
      expect(result.error).toMatch(/foreign key/);
    }));

  it("gérant et comptable ne gèrent pas les rattachements", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.managerA1);
      expect(
        (await ctx.tryQuery("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [w.shopA2, w.managerA1, w.tenantA])).error,
      ).toMatch(/row-level security/);
      expect(await ctx.tryQuery("update public.shop_members set revoked_at = now()")).toEqual({ error: null, rowCount: 0 });
    }));

  it("un rattachement révoqué ne se réactive pas et ne se supprime pas", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      await ctx.tryQuery("update public.shop_members set revoked_at = now() where user_id = $1", [w.managerA1]);
      expect((await ctx.tryQuery("update public.shop_members set revoked_at = null where user_id = $1", [w.managerA1])).error).toMatch(
        /révoqué/,
      );
      expect((await ctx.tryQuery("delete from public.shop_members where user_id = $1", [w.managerA1])).error).toMatch(/permission denied/);
    }));
});

describe("platform_admins", () => {
  it("chacun ne voit que sa propre ligne d'admin", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      expect(await ctx.rows("select user_id from public.platform_admins")).toEqual([]);
      await ctx.as(w.admin);
      expect(await ctx.rows("select user_id from public.platform_admins")).toEqual([{ user_id: w.admin }]);
    }));
});

describe("anonyme", () => {
  it("anon n'a accès à aucune table", () =>
    scenario(async (ctx) => {
      await seedWorld(ctx);
      await ctx.as(null);
      for (const table of ["tenants", "shops", "profiles", "profile_contacts", "platform_admins", "shop_members"]) {
        expect((await ctx.tryQuery(`select * from public.${table} limit 1`)).error, table).toMatch(/permission denied/);
      }
    }));
});
