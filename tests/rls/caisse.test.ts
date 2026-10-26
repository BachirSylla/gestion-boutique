// Jalon 7 : clôture de journée (RG7) — droits, isolation, idempotence, immuabilité.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, scenario, seedWorld, type Ctx } from "./harness";

beforeAll(connect);
afterAll(disconnect);

async function methods(ctx: Ctx, shopId: string) {
  await ctx.asSystem();
  const rows = await ctx.rows<{ id: string; kind: string }>("select id, kind from public.payment_methods where shop_id = $1", [shopId]);
  return Object.fromEntries(rows.map((r) => [r.kind, r.id])) as Record<string, string>;
}

const close = (ctx: Ctx, shopId: string, amounts: unknown, id = randomUUID(), date = "current_date") =>
  ctx.tryQuery(`select public.record_day_closing($1, $2, ${date}, $3::jsonb, null, now())`, [id, shopId, JSON.stringify(amounts)]);

describe("clôture de journée (RG7)", () => {
  it("le gérant enregistre tout l'argent reçu par moyen ; le total est calculé par la base ; renvoi sans doublon", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const m = await methods(ctx, w.shopA1);
      const id = randomUUID();
      const amounts = [
        { payment_method_id: m.cash, amount: 40_000 },
        { payment_method_id: m.wave, amount: 12_000 },
        { payment_method_id: m.orange_money, amount: 3_000 },
      ];
      await ctx.as(w.managerA1);
      expect((await close(ctx, w.shopA1, amounts, id)).error).toBeNull();
      // Renvoi de la même saisie (réseau instable) : aucun doublon.
      expect((await close(ctx, w.shopA1, amounts, id)).error).toBeNull();
      await ctx.asSystem();
      const rows = await ctx.rows<{ total_received: string; n: string }>(
        "select c.total_received, (select count(*) from public.day_closing_amounts a where a.closing_id = c.id) n from public.day_closings c where c.shop_id = $1",
        [w.shopA1],
      );
      expect(rows).toEqual([{ total_received: "55000", n: "3" }]);
    }));

  it("une nouvelle clôture du même jour s'ajoute (la dernière fait foi), l'historique reste", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const m = await methods(ctx, w.shopA1);
      await ctx.as(w.ownerA);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: m.cash, amount: 10_000 }])).error).toBeNull();
      expect((await close(ctx, w.shopA1, [{ payment_method_id: m.cash, amount: 12_000 }])).error).toBeNull();
      const rows = await ctx.rows<{ total_received: string }>("select total_received from public.day_closings where shop_id = $1 order by server_created_at, total_received", [w.shopA1]);
      expect(rows.map((r) => r.total_received)).toEqual(["10000", "12000"]);
    }));

  it("comptable, gérant d'une autre boutique, autre propriétaire, compte désactivé : refusés", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const a1 = await methods(ctx, w.shopA1);
      const a2 = await methods(ctx, w.shopA2);
      const one = (id: string) => [{ payment_method_id: id, amount: 1_000 }];
      await ctx.as(w.accountantA);
      expect((await close(ctx, w.shopA1, one(a1.cash!))).error).toMatch(/clôture|droit|autoris/i);
      await ctx.as(w.managerA1);
      expect((await close(ctx, w.shopA2, one(a2.cash!))).error).not.toBeNull();
      await ctx.as(w.ownerB);
      expect((await close(ctx, w.shopA1, one(a1.cash!))).error).not.toBeNull();
      await ctx.as(w.disabledManagerA);
      expect((await close(ctx, w.shopA1, one(a1.cash!))).error).not.toBeNull();
      await ctx.asSystem();
      expect(await ctx.rows("select 1 from public.day_closings where shop_id in ($1, $2)", [w.shopA1, w.shopA2])).toHaveLength(0);
    }));

  it("montants entiers ≥ 0, moyens de la boutique, sans doublon ; jour ni futur ni trop ancien", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const a1 = await methods(ctx, w.shopA1);
      const b1 = await methods(ctx, w.shopB1);
      await ctx.as(w.managerA1);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: 12.5 }])).error).toMatch(/entier/);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: -5 }])).error).toMatch(/entier/);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: "100" }])).error).toMatch(/entier/);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: b1.cash, amount: 100 }])).error).toMatch(/Moyen/);
      expect(
        (await close(ctx, w.shopA1, [
          { payment_method_id: a1.cash, amount: 100 },
          { payment_method_id: a1.cash, amount: 200 },
        ])).error,
      ).toMatch(/Moyen/);
      expect((await close(ctx, w.shopA1, [])).error).toMatch(/absents/);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: 100 }], randomUUID(), "current_date + 5")).error).toMatch(/Jour/);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: 100 }], randomUUID(), "current_date - 100")).error).toMatch(/Jour/);
      // Correction de la veille : acceptée.
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: 100 }], randomUUID(), "current_date - 1")).error).toBeNull();
    }));

  it("un identifiant déjà utilisé par quelqu'un d'autre est refusé", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const m = await methods(ctx, w.shopA1);
      const id = randomUUID();
      await ctx.as(w.managerA1);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: m.cash, amount: 100 }], id)).error).toBeNull();
      await ctx.as(w.ownerA);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: m.cash, amount: 999 }], id)).error).toMatch(/déjà utilisé/);
    }));

  it("journal immuable : ni modification ni suppression, même par écriture directe", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const m = await methods(ctx, w.shopA1);
      await ctx.as(w.ownerA);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: m.cash, amount: 100 }])).error).toBeNull();
      expect((await ctx.tryQuery("update public.day_closings set total_received = 1 where shop_id = $1", [w.shopA1])).rowCount).toBe(0);
      expect((await ctx.tryQuery("insert into public.day_closings (id, shop_id, business_date, total_received, author_id, device_created_at) values ($1, $2, current_date, 1, $3, now())", [randomUUID(), w.shopA1, w.ownerA])).error).not.toBeNull();
      await ctx.asSystem();
      expect((await ctx.tryQuery("update public.day_closings set total_received = 1 where shop_id = $1", [w.shopA1])).error).toMatch(/immuable/);
      expect((await ctx.tryQuery("delete from public.day_closing_amounts where shop_id = $1", [w.shopA1])).error).toMatch(/immuable/);
    }));

  it("lecture : les membres de la boutique seulement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const a1 = await methods(ctx, w.shopA1);
      const a2 = await methods(ctx, w.shopA2);
      await ctx.as(w.ownerA);
      expect((await close(ctx, w.shopA1, [{ payment_method_id: a1.cash, amount: 100 }])).error).toBeNull();
      expect((await close(ctx, w.shopA2, [{ payment_method_id: a2.cash, amount: 200 }])).error).toBeNull();
      const totals = async () => (await ctx.rows<{ total_received: string }>("select total_received from public.day_closings order by total_received")).map((r) => r.total_received);
      const amounts = async () => (await ctx.rows("select 1 from public.day_closing_amounts")).length;
      await ctx.as(w.accountantA);
      expect(await totals()).toEqual(["100", "200"]);
      await ctx.as(w.managerA1);
      expect(await totals()).toEqual(["100"]);
      expect(await amounts()).toBe(1);
      await ctx.as(w.ownerB);
      expect(await totals()).toEqual([]);
      expect(await amounts()).toBe(0);
      await ctx.as(w.managerB1);
      expect(await totals()).toEqual([]);
    }));
});
