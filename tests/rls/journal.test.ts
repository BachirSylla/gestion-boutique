// Jalon 3 : clients, journal immuable, soldes, annulations et demandes, réglages.
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lineAmount, type RoundingStep } from "@/shared/domain";
import { connect, disconnect, scenario, seedWorld, type Ctx, type World } from "./harness";

beforeAll(connect);
afterAll(disconnect);

const NOW = () => new Date().toISOString();

async function customer(ctx: Ctx, shopId: string, type = "free"): Promise<string> {
  const id = randomUUID();
  await ctx.asSystem();
  await ctx.db.query("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'Awa Ndiaye', $3)", [id, shopId, type]);
  return id;
}

async function take(ctx: Ctx, customerId: string, amount: number, id = randomUUID()) {
  return ctx.tryQuery("select public.record_take($1, $2, 'quick', $3, null, null, $4)", [id, customerId, amount, NOW()]);
}

async function cashMethod(ctx: Ctx, shopId: string): Promise<string> {
  await ctx.asSystem();
  const [row] = await ctx.rows<{ id: string }>("select id from public.payment_methods where shop_id = $1 and kind = 'cash'", [shopId]);
  return row!.id;
}

async function balance(ctx: Ctx, customerId: string): Promise<number> {
  await ctx.asSystem();
  const [row] = await ctx.rows<{ balance: string }>("select balance from public.customer_balances where customer_id = $1", [customerId]);
  return Number(row!.balance);
}

describe("arrondi des lignes : SQL = TypeScript (RG3)", () => {
  it("exemples du cahier", () =>
    scenario(async (ctx) => {
      const rows = await ctx.rows<{ a: string; b: string; c: string; d: string }>(
        "select private.line_amount(250, 315, 5) a, private.line_amount(250, 315, 1) b, private.line_amount(250, 315, 25) c, private.line_amount(500, 315, 5) d",
      );
      expect(rows[0]).toEqual({ a: "80", b: "79", c: "75", d: "160" });
    }));

  it("2 000 cas tirés au hasard donnent le même résultat des deux côtés", () =>
    scenario(async (ctx) => {
      const steps: RoundingStep[] = [1, 5, 25];
      const cases = Array.from({ length: 2000 }, () => ({
        q: randomInt(1, 60_000),
        p: randomInt(1, 20_000),
        s: steps[randomInt(0, 3)]!,
      }));
      const rows = await ctx.rows<{ r: string }>(
        "select private.line_amount(q, p, s) r from unnest($1::bigint[], $2::bigint[], $3::int[]) with ordinality as t(q, p, s, n) order by n",
        [cases.map((c) => c.q), cases.map((c) => c.p), cases.map((c) => c.s)],
      );
      expect(rows.map((r) => Number(r.r))).toEqual(cases.map((c) => lineAmount(c.q, c.p, c.s)));
    }));
});

describe("clients", () => {
  it("propriétaire et gérant créent un client dans leur boutique ; le comptable lit seulement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const insert = (shop: string) => ctx.tryQuery("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'X', 'free')", [randomUUID(), shop]);
      await ctx.as(w.managerA1);
      expect((await insert(w.shopA1)).error).toBeNull();
      expect((await insert(w.shopA2)).error).toMatch(/row-level security/); // pas sa boutique
      await ctx.as(w.ownerA);
      expect((await insert(w.shopA2)).error).toBeNull();
      await ctx.as(w.accountantA);
      expect((await insert(w.shopA1)).error).toMatch(/row-level security/);
      expect((await ctx.rows("select id from public.customers")).length).toBe(2);
      await ctx.as(w.ownerB);
      expect(await ctx.rows("select id from public.customers")).toEqual([]);
      await ctx.as(w.admin);
      expect(await ctx.rows("select id from public.customers")).toEqual([]); // l'admin ne voit pas les clients
    }));

  it("un client ne change pas de boutique et ne se supprime pas", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("update public.customers set shop_id = $1 where id = $2", [w.shopA2, id])).error).toMatch(/permission denied/);
      expect((await ctx.tryQuery("delete from public.customers where id = $1", [id])).error).toMatch(/permission denied/);
      expect(await ctx.tryQuery("update public.customers set type = 'monthly', archived_at = now() where id = $1", [id])).toEqual({ error: null, rowCount: 1 });
    }));
});

describe("prises et versements", () => {
  it("solde = versements − prises ; le gérant saisit, le comptable non", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      const cash = await cashMethod(ctx, w.shopA1);
      await ctx.as(w.managerA1);
      expect((await take(ctx, id, 2500)).error).toBeNull();
      expect((await take(ctx, id, 1500)).error).toBeNull();
      expect((await ctx.tryQuery("select public.record_payment($1, $2, 3000, $3, 'acompte', $4)", [randomUUID(), id, cash, NOW()])).error).toBeNull();
      expect(await balance(ctx, id)).toBe(-1000);
      await ctx.as(w.accountantA);
      expect((await take(ctx, id, 100)).error).toMatch(/42501|Seuls/);
      await ctx.as(w.managerB1);
      expect((await take(ctx, id, 100)).error).toMatch(/42501|Seuls/);
    }));

  it("prise détaillée : le serveur recalcule les lignes et le total avec le pas de la boutique", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      await ctx.as(w.managerA1);
      const lines = [
        { label: "Riz brisé", quantity_milli: 250, unit: "kg", unit_price: 315 }, // 78,75 → 80
        { label: "Huile", quantity_milli: 500, unit: "l", unit_price: 1100, line_amount: 550 },
      ];
      const opId = randomUUID();
      const ok = await ctx.rows<{ r: { status: string; amount: number } }>("select public.record_take($1, $2, 'detailed', null, null, $3, $4) as r", [
        opId,
        id,
        JSON.stringify(lines),
        NOW(),
      ]);
      expect(ok[0]?.r).toMatchObject({ status: "created", amount: 630 });
      const stored = await ctx.rows<{ line_amount: string; unit_price: string }>("select line_amount, unit_price from public.take_lines where operation_id = $1 order by position", [opId]);
      expect(stored).toEqual([
        { line_amount: "80", unit_price: "315" },
        { line_amount: "550", unit_price: "1100" },
      ]);
      // Montant de ligne ou total incohérents : refusés.
      const bad = [{ label: "Riz", quantity_milli: 250, unit: "kg", unit_price: 315, line_amount: 79 }];
      expect((await ctx.tryQuery("select public.record_take($1, $2, 'detailed', null, null, $3, $4)", [randomUUID(), id, JSON.stringify(bad), NOW()])).error).toMatch(/incohérent/);
      expect((await ctx.tryQuery("select public.record_take($1, $2, 'detailed', 600, null, $3, $4)", [randomUUID(), id, JSON.stringify(lines), NOW()])).error).toMatch(/Total incohérent/);
    }));

  it("au pas de 1 F, la même ligne vaut 79 F", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      await ctx.asSystem();
      await ctx.db.query("update public.shop_settings set rounding_step = 1 where shop_id = $1", [w.shopA1]);
      await ctx.as(w.managerA1);
      const lines = [{ label: "Riz", quantity_milli: 250, unit: "kg", unit_price: 315 }];
      const [row] = await ctx.rows<{ r: { amount: number } }>("select public.record_take($1, $2, 'detailed', null, null, $3, $4) as r", [randomUUID(), id, JSON.stringify(lines), NOW()]);
      expect(row?.r.amount).toBe(79);
    }));

  it("montant nul, client archivé : refusés", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      await ctx.as(w.managerA1);
      expect((await take(ctx, id, 0)).error).toMatch(/montant > 0/);
      await ctx.tryQuery("update public.customers set archived_at = now() where id = $1", [id]);
      expect((await take(ctx, id, 500)).error).toMatch(/archivé/);
    }));

  it("idempotence : un renvoi du même identifiant ne crée pas de doublon", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      const opId = randomUUID();
      await ctx.as(w.managerA1);
      const first = await ctx.rows<{ r: { status: string } }>("select public.record_take($1, $2, 'quick', 1000, null, null, $3) as r", [opId, id, NOW()]);
      const again = await ctx.rows<{ r: { status: string } }>("select public.record_take($1, $2, 'quick', 1000, null, null, $3) as r", [opId, id, NOW()]);
      expect(first[0]?.r.status).toBe("created");
      expect(again[0]?.r.status).toBe("duplicate");
      expect(await balance(ctx, id)).toBe(-1000);
      // Le même identifiant par quelqu'un d'autre : refusé, jamais écrasé.
      await ctx.as(w.ownerA);
      expect((await take(ctx, id, 9999, opId)).error).toMatch(/déjà utilisé/);
    }));
});

describe("journal immuable", () => {
  it("personne ne modifie ni ne supprime une opération, même avec la clé secrète", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const id = await customer(ctx, w.shopA1);
      await ctx.as(w.ownerA);
      await take(ctx, id, 1000);
      expect((await ctx.tryQuery("update public.customer_operations set amount = 1")).error).toMatch(/permission denied/);
      expect((await ctx.tryQuery("delete from public.customer_operations")).error).toMatch(/permission denied/);
      expect((await ctx.tryQuery("insert into public.customer_operations (id, shop_id, customer_id, kind, amount, take_mode, author_id, device_created_at) values ($1, $2, $3, 'take', 5, 'quick', $4, now())", [randomUUID(), w.shopA1, id, w.ownerA])).error).toMatch(/permission denied/);
      await ctx.asService();
      expect((await ctx.tryQuery("update public.customer_operations set amount = 1")).error).toMatch(/immuable/);
      expect((await ctx.tryQuery("delete from public.customer_operations")).error).toMatch(/immuable/);
      expect((await ctx.tryQuery("delete from public.take_lines")).error).toBeNull(); // aucune ligne : rien à supprimer
      await ctx.asSystem();
      expect((await ctx.tryQuery("truncate public.customer_operations cascade")).error).toMatch(/immuable/);
    }));

  it("la purge n'est appelable ni par un utilisateur ni par le serveur", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      for (const switchRole of [() => ctx.as(w.ownerA), () => ctx.asService()]) {
        await switchRole();
        expect((await ctx.tryQuery("select private.purge_tenant($1)", [w.tenantA])).error).toMatch(/permission denied/);
      }
    }));
});

describe("annulations (RG1)", () => {
  async function seedOperation(ctx: Ctx, w: World, author: string, minutesAgo: number) {
    const id = await customer(ctx, w.shopA1);
    const opId = randomUUID();
    await ctx.asSystem();
    await ctx.db.query(
      `insert into public.customer_operations (id, shop_id, customer_id, kind, amount, take_mode, author_id, device_created_at, server_created_at)
       values ($1, $2, $3, 'take', 2000, 'quick', $4, now(), now() - make_interval(mins => $5))`,
      [opId, w.shopA1, id, author, minutesAgo],
    );
    return { customerId: id, opId };
  }
  const cancel = (ctx: Ctx, opId: string) => ctx.tryQuery("select public.cancel_operation($1, $2, 'erreur', $3)", [randomUUID(), opId, NOW()]);

  it("le gérant annule sa propre opération dans le délai ; le solde l'exclut", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { customerId, opId } = await seedOperation(ctx, w, w.managerA1, 10);
      await ctx.as(w.managerA1);
      expect((await cancel(ctx, opId)).error).toBeNull();
      expect(await balance(ctx, customerId)).toBe(0);
    }));

  it("hors délai (15 min par défaut) ou opération d'un autre : demande nécessaire (BT001)", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const late = await seedOperation(ctx, w, w.managerA1, 16);
      const other = await seedOperation(ctx, w, w.ownerA, 1);
      await ctx.as(w.managerA1);
      expect((await cancel(ctx, late.opId)).error).toMatch(/demande d'annulation/);
      expect((await cancel(ctx, other.opId)).error).toMatch(/demande d'annulation/);
    }));

  it("le délai réglé par le propriétaire (jusqu'à 60 min) s'applique au moment de l'annulation", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const op = await seedOperation(ctx, w, w.managerA1, 45);
      await ctx.as(w.managerA1);
      expect((await cancel(ctx, op.opId)).error).toMatch(/demande d'annulation/);
      await ctx.as(w.ownerA);
      expect(await ctx.tryQuery("update public.shop_settings set cancel_window_minutes = 60 where shop_id = $1", [w.shopA1])).toEqual({ error: null, rowCount: 1 });
      expect((await ctx.tryQuery("update public.shop_settings set cancel_window_minutes = 61 where shop_id = $1", [w.shopA1])).error).toMatch(/check/);
      await ctx.as(w.managerA1);
      expect((await cancel(ctx, op.opId)).error).toBeNull();
    }));

  it("le propriétaire annule directement ; une annulation ne s'annule pas ni ne se répète", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const op = await seedOperation(ctx, w, w.managerA1, 600);
      await ctx.as(w.ownerA);
      const cancellationId = randomUUID();
      expect((await ctx.tryQuery("select public.cancel_operation($1, $2, null, $3)", [cancellationId, op.opId, NOW()])).error).toBeNull();
      expect((await cancel(ctx, op.opId)).error).toMatch(/déjà annulée/);
      expect((await cancel(ctx, cancellationId)).error).toMatch(/ne s'annule pas/);
    }));

  it("le comptable et l'autre propriétaire n'annulent rien", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const op = await seedOperation(ctx, w, w.managerA1, 1);
      for (const user of [w.accountantA, w.ownerB]) {
        await ctx.as(user);
        expect((await cancel(ctx, op.opId)).error).toMatch(/42501|introuvable/);
      }
    }));

  it("demande d'annulation : motif obligatoire, une seule en attente, décision du propriétaire seulement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const op = await seedOperation(ctx, w, w.ownerA, 120);
      const request = (reason: string) => ctx.tryQuery("select public.request_cancellation($1, $2, $3, $4)", [randomUUID(), op.opId, reason, NOW()]);
      await ctx.as(w.managerA1);
      expect((await request("")).error).toMatch(/motif/);
      expect((await request("Le client n'a rien pris")).error).toBeNull();
      expect((await request("Encore")).error).toMatch(/déjà en attente/);
      const [pending] = await ctx.rows<{ id: string }>("select id from public.cancellation_requests where operation_id = $1", [op.opId]);
      const decide = (approve: boolean) => ctx.tryQuery("select public.decide_cancellation($1, $2, null, $3)", [pending!.id, approve, randomUUID()]);
      expect((await decide(true)).error).toMatch(/42501|propriétaire/);
      await ctx.as(w.ownerB);
      expect((await decide(true)).error).toMatch(/42501|propriétaire/);
      await ctx.as(w.ownerA);
      expect((await decide(true)).error).toBeNull();
      expect((await decide(false)).error).toMatch(/déjà traitée/);
      expect(await balance(ctx, op.customerId)).toBe(0);
      await ctx.asSystem();
      const [cancellation] = await ctx.rows<{ author_id: string; cancellation_reason: string }>(
        "select author_id, cancellation_reason from public.customer_operations where cancels_operation_id = $1",
        [op.opId],
      );
      expect(cancellation).toEqual({ author_id: w.ownerA, cancellation_reason: "Le client n'a rien pris" });
    }));

  it("une demande refusée laisse l'opération et permet une nouvelle demande", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const op = await seedOperation(ctx, w, w.ownerA, 120);
      await ctx.as(w.managerA1);
      const requestId = randomUUID();
      await ctx.tryQuery("select public.request_cancellation($1, $2, 'erreur de client', $3)", [requestId, op.opId, NOW()]);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("select public.decide_cancellation($1, false, 'pris bien', null)", [requestId])).error).toBeNull();
      expect(await balance(ctx, op.customerId)).toBe(-2000);
      await ctx.as(w.managerA1);
      expect((await ctx.tryQuery("select public.request_cancellation($1, $2, 'vraiment une erreur', $3)", [randomUUID(), op.opId, NOW()])).error).toBeNull();
      expect((await ctx.tryQuery("delete from public.cancellation_requests")).error).toMatch(/permission denied/);
    }));
});

describe("réglages et moyens de paiement", () => {
  it("chaque boutique reçoit ses réglages et ses moyens de paiement ; seul le propriétaire les change", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.managerA1);
      const [settings] = await ctx.rows<{ cancel_window_minutes: number; rounding_step: number }>(
        "select cancel_window_minutes, rounding_step from public.shop_settings where shop_id = $1",
        [w.shopA1],
      );
      expect(settings).toEqual({ cancel_window_minutes: 15, rounding_step: 5 });
      const kinds = (await ctx.rows<{ kind: string }>("select kind from public.payment_methods where shop_id = $1 order by position", [w.shopA1])).map((m) => m.kind);
      expect(kinds).toEqual(["cash", "wave", "orange_money", "other"]);
      expect(await ctx.tryQuery("update public.shop_settings set rounding_step = 25 where shop_id = $1", [w.shopA1])).toEqual({ error: null, rowCount: 0 });
      expect((await ctx.tryQuery("insert into public.payment_methods (shop_id, kind, label) values ($1, 'custom', 'Free Money')", [w.shopA1])).error).toMatch(/row-level security/);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("insert into public.payment_methods (shop_id, kind, label) values ($1, 'custom', 'Free Money')", [w.shopA1])).error).toBeNull();
      expect((await ctx.tryQuery("insert into public.payment_methods (shop_id, kind, label) values ($1, 'custom', 'X')", [w.shopB1])).error).toMatch(/row-level security/);
    }));
});
