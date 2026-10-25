// Jalon 2 : fonctions d'administration des comptes (srv_*) et journal account_events.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, scenario, seedWorld, sorted, type Ctx } from "./harness";

beforeAll(connect);
afterAll(disconnect);

/** Crée un compte Auth vide (le serveur le fait via l'API Auth avant d'appeler srv_*). */
async function authUser(ctx: Ctx): Promise<string> {
  const id = randomUUID();
  await ctx.asSystem();
  await ctx.db.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}', '{}')`,
    [id, `rls-new-${id.slice(0, 8)}@test.bitig.invalid`],
  );
  return id;
}

let phoneSeq = 0;
const phone = () => `+22176${String(8_000_000 + ++phoneSeq).padStart(7, "0")}`;

const FORBIDDEN = /42501|seul|réservé|propriétaire|administrateur|introuvable|autre propriétaire/i;

describe("droits d'exécution", () => {
  it("les fonctions srv_* ne sont exécutables que par le serveur", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      for (const user of [w.ownerA, w.admin, w.managerA1]) {
        await ctx.as(user);
        const result = await ctx.tryQuery("select public.srv_set_tenant_status($1, $2, 'suspended')", [w.admin, w.tenantB]);
        expect(result.error, user).toMatch(/permission denied/);
      }
      await ctx.as(null);
      expect((await ctx.tryQuery("select public.srv_create_shop($1, $2, 'X')", [w.ownerA, w.tenantA])).error).toMatch(/permission denied/);
    }));

  it("toute fonction de public exécutable par authenticated est explicitement autorisée", () =>
    scenario(async (ctx) => {
      // Écritures du journal client (jalon 3) : contrôlent elles-mêmes les droits avec auth.uid().
      const allowed = ["add_starter_catalog", "cancel_operation", "cancel_pending_price", "change_price", "create_product", "decide_cancellation", "record_payment", "record_take", "request_cancellation"];
      const rows = await ctx.rows<{ name: string }>(
        `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`,
      );
      expect(rows.map((r) => r.name)).toEqual(allowed);
    }));
});

describe("admin plateforme : propriétaires", () => {
  it("crée un propriétaire, son compte et sa première boutique, avec journal", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const ownerId = await authUser(ctx);
      const ownerPhone = phone();
      await ctx.asService();
      const [row] = await ctx.rows<{ id: string }>("select public.srv_create_tenant($1, 'Awa Ndiaye', $2, 'Awa Ndiaye', $3, 'Boutique Awa', 'Pikine', 'Dakar') as id", [
        w.admin,
        ownerId,
        ownerPhone,
      ]);
      const tenantId = row!.id;
      await ctx.as(ownerId);
      expect(await ctx.ids("select id from public.tenants")).toEqual([tenantId]);
      const shops = await ctx.rows<{ name: string; created_by: string }>("select name, created_by from public.shops");
      expect(shops).toEqual([{ name: "Boutique Awa", created_by: w.admin }]);
      const [profile] = await ctx.rows<{ role: string; must_change_password: boolean }>("select role, must_change_password from public.profiles");
      expect(profile).toEqual({ role: "owner", must_change_password: true });
      const events = (await ctx.rows<{ type: string }>("select type::text from public.account_events order by type::text")).map((e) => e.type);
      expect(events).toEqual(["member_created", "shop_created", "tenant_created"]);
    }));

  it("un propriétaire ne peut pas créer de propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const userId = await authUser(ctx);
      await ctx.asService();
      const result = await ctx.tryQuery("select public.srv_create_tenant($1, 'X', $2, 'X', $3)", [w.ownerA, userId, phone()]);
      expect(result.error).toMatch(FORBIDDEN);
    }));

  it("suspend et réactive un propriétaire ; un propriétaire ne suspend personne", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      expect((await ctx.tryQuery("select public.srv_set_tenant_status($1, $2, 'suspended')", [w.ownerA, w.tenantB])).error).toMatch(FORBIDDEN);
      expect((await ctx.tryQuery("select public.srv_set_tenant_status($1, $2, 'suspended')", [w.admin, w.tenantB])).error).toBeNull();
      await ctx.as(w.ownerB);
      expect(await ctx.rows("select id from public.shops")).toEqual([]);
      await ctx.asService();
      await ctx.tryQuery("select public.srv_set_tenant_status($1, $2, 'active')", [w.admin, w.tenantB]);
      await ctx.as(w.ownerB);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopB1]);
      await ctx.as(w.admin);
      const types = (await ctx.rows<{ type: string }>("select type from public.account_events where tenant_id = $1 order by created_at", [w.tenantB])).map(
        (e) => e.type,
      );
      expect(types).toEqual(["tenant_suspended", "tenant_reactivated"]);
    }));
});

describe("boutiques", () => {
  it("le propriétaire et l'admin créent une boutique, pas un gérant ni un autre propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      expect((await ctx.tryQuery("select public.srv_create_shop($1, $2, 'A3')", [w.ownerA, w.tenantA])).error).toBeNull();
      expect((await ctx.tryQuery("select public.srv_create_shop($1, $2, 'A4')", [w.admin, w.tenantA])).error).toBeNull();
      expect((await ctx.tryQuery("select public.srv_create_shop($1, $2, 'X')", [w.managerA1, w.tenantA])).error).toMatch(FORBIDDEN);
      expect((await ctx.tryQuery("select public.srv_create_shop($1, $2, 'X')", [w.ownerB, w.tenantA])).error).toMatch(FORBIDDEN);
    }));
});

describe("propriétaire : employés", () => {
  it("crée un gérant rattaché à ses boutiques ; le gérant ne voit que celles-ci", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const userId = await authUser(ctx);
      await ctx.asService();
      const created = await ctx.tryQuery("select public.srv_create_member($1, $2, 'manager', 'Moussa', $3, $4)", [w.ownerA, userId, phone(), [w.shopA2]]);
      expect(created.error).toBeNull();
      await ctx.as(userId);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopA2]);
      const [profile] = await ctx.rows<{ must_change_password: boolean }>("select must_change_password from public.profiles where user_id = $1", [userId]);
      expect(profile?.must_change_password).toBe(true);
    }));

  it("refuse : boutique d'un autre propriétaire, rôle propriétaire, aucune boutique, auteur non propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const userId = await authUser(ctx);
      await ctx.asService();
      const call = (actor: string, role: string, shops: string[]) =>
        ctx.tryQuery("select public.srv_create_member($1, $2, $3::public.app_role, 'X', $4, $5)", [actor, userId, role, phone(), shops]);
      expect((await call(w.ownerA, "manager", [w.shopB1])).error).toMatch(FORBIDDEN);
      expect((await call(w.ownerA, "owner", [w.shopA1])).error).toMatch(FORBIDDEN);
      expect((await call(w.ownerA, "manager", [])).error).toMatch(/au moins une boutique/);
      expect((await call(w.managerA1, "manager", [w.shopA1])).error).toMatch(FORBIDDEN);
      expect((await call(w.admin, "manager", [w.shopA1])).error).toMatch(FORBIDDEN);
    }));

  it("change les rattachements d'un employé et trace le changement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      const [row] = await ctx.rows<{ changes: { added: string[]; removed: string[] } }>(
        "select public.srv_set_member_shops($1, $2, $3) as changes",
        [w.ownerA, w.managerA1, [w.shopA2]],
      );
      expect(row?.changes).toEqual({ added: [w.shopA2], removed: [w.shopA1] });
      await ctx.as(w.managerA1);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopA2]);
      await ctx.as(w.ownerA);
      const [revoked] = await ctx.rows<{ revoked_by: string }>("select revoked_by from public.shop_members where user_id = $1 and shop_id = $2", [
        w.managerA1,
        w.shopA1,
      ]);
      expect(revoked?.revoked_by).toBe(w.ownerA);
      const [event] = await ctx.rows<{ type: string; actor_id: string }>("select type, actor_id from public.account_events where target_user_id = $1", [
        w.managerA1,
      ]);
      expect(event).toEqual({ type: "member_shops_changed", actor_id: w.ownerA });
    }));

  it("un propriétaire ne gère ni les employés d'un autre, ni lui-même", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      expect((await ctx.tryQuery("select public.srv_set_member_status($1, $2, 'disabled')", [w.ownerA, w.managerB1])).error).toMatch(FORBIDDEN);
      expect((await ctx.tryQuery("select public.srv_set_member_status($1, $2, 'disabled')", [w.ownerA, w.ownerA])).error).toMatch(FORBIDDEN);
      expect((await ctx.tryQuery("select public.srv_set_member_shops($1, $2, $3)", [w.ownerB, w.managerA1, [w.shopB1]])).error).toMatch(FORBIDDEN);
    }));

  it("désactive puis réactive un employé", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      await ctx.tryQuery("select public.srv_set_member_status($1, $2, 'disabled')", [w.ownerA, w.managerA1]);
      await ctx.as(w.managerA1);
      expect(await ctx.rows("select id from public.shops")).toEqual([]);
      await ctx.asService();
      await ctx.tryQuery("select public.srv_set_member_status($1, $2, 'active')", [w.ownerA, w.managerA1]);
      await ctx.as(w.managerA1);
      expect(await ctx.ids("select id from public.shops")).toEqual([w.shopA1]);
    }));
});

describe("mots de passe", () => {
  it("l'admin réinitialise un propriétaire, le propriétaire ses employés, personne d'autre", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      const check = (actor: string, target: string) => ctx.tryQuery("select public.srv_check_password_reset($1, $2)", [actor, target]);
      expect((await check(w.admin, w.ownerA)).error).toBeNull();
      expect((await check(w.ownerA, w.managerA1)).error).toBeNull();
      expect((await check(w.ownerA, w.accountantA)).error).toBeNull();
      expect((await check(w.admin, w.managerA1)).error).toMatch(FORBIDDEN); // l'admin ne gère pas les employés
      expect((await check(w.ownerA, w.ownerB)).error).toMatch(FORBIDDEN);
      expect((await check(w.ownerA, w.managerB1)).error).toMatch(FORBIDDEN);
      expect((await check(w.managerA1, w.accountantA)).error).toMatch(FORBIDDEN);
      expect((await check(w.ownerB, w.ownerA)).error).toMatch(FORBIDDEN);
    }));

  it("une réinitialisation impose de changer le mot de passe ; le changement lève l'obligation", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asSystem();
      await ctx.db.query("update public.profiles set must_change_password = false where user_id = $1", [w.managerA1]);
      await ctx.asService();
      await ctx.tryQuery("select public.srv_record_password_reset($1, $2)", [w.ownerA, w.managerA1]);
      await ctx.as(w.managerA1);
      const flag = async () =>
        (await ctx.rows<{ f: boolean }>("select must_change_password as f from public.profiles where user_id = $1", [w.managerA1]))[0]?.f;
      expect(await flag()).toBe(true);
      await ctx.asService();
      await ctx.tryQuery("select public.srv_record_password_change($1)", [w.managerA1]);
      await ctx.as(w.managerA1);
      expect(await flag()).toBe(false);
      const types = (await ctx.rows<{ type: string }>("select type from public.account_events where target_user_id = $1 order by created_at", [w.managerA1])).map(
        (e) => e.type,
      );
      expect(types).toEqual(["password_reset", "password_changed"]);
    }));
});

describe("account_events", () => {
  it("le propriétaire voit le journal de son tenant ; un gérant seulement ce qui le concerne ; personne n'y écrit", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.asService();
      await ctx.tryQuery("select public.srv_set_member_shops($1, $2, $3)", [w.ownerA, w.managerA1, [w.shopA1, w.shopA2]]);
      await ctx.tryQuery("select public.srv_set_member_shops($1, $2, $3)", [w.ownerA, w.accountantA, [w.shopA1]]);
      await ctx.tryQuery("select public.srv_set_member_status($1, $2, 'disabled')", [w.ownerB, w.managerB1]);

      await ctx.as(w.ownerA);
      const ownerSees = (await ctx.rows<{ target_user_id: string }>("select target_user_id from public.account_events")).map((e) => e.target_user_id);
      expect(ownerSees.sort()).toEqual(sorted(w.managerA1, w.accountantA));
      await ctx.as(w.managerA1);
      expect((await ctx.rows<{ target_user_id: string }>("select target_user_id from public.account_events")).map((e) => e.target_user_id)).toEqual([
        w.managerA1,
      ]);
      expect((await ctx.tryQuery("insert into public.account_events (type, tenant_id) values ('tenant_created', $1)", [w.tenantA])).error).toMatch(
        /permission denied/,
      );
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("delete from public.account_events")).error).toMatch(/permission denied/);
      expect((await ctx.tryQuery("update public.account_events set details = '{}'")).error).toMatch(/permission denied/);
    }));
});
