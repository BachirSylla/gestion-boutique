// Jalon 5a : catalogue, grille de prix versionnée (RG3, RG4), lignes de prise à format.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, scenario, seedWorld, type Ctx, type World } from "./harness";

beforeAll(connect);
afterAll(disconnect);

const RIZ_FORMATS = JSON.stringify([
  { label: "½ kg", quantity_milli: 500, price: 160 },
  { label: "1 kg", quantity_milli: 1000, price: 315 },
]);

async function createRiz(ctx: Ctx, w: World, actor = w.ownerA) {
  const id = randomUUID();
  await ctx.as(actor);
  const result = await ctx.tryQuery("select public.create_product($1, $2, 'Riz brisé', 'Céréales', 'sac', 'kg', 50000, 1, 315, 15000, $3)", [id, w.shopA1, RIZ_FORMATS]);
  return { id, error: result.error };
}

async function prices(ctx: Ctx, productId: string) {
  await ctx.asSystem();
  const [row] = await ctx.rows<{ retail_price: string; pending_retail_price: string | null; formats: { label: string; price: number }[] }>(
    "select retail_price, pending_retail_price, formats from public.product_prices where product_id = $1",
    [productId],
  );
  return row!;
}

describe("catalogue", () => {
  it("le propriétaire crée un produit avec sa grille ; gérant et autre propriétaire ne peuvent pas", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      expect((await createRiz(ctx, w)).error).toBeNull();
      expect((await createRiz(ctx, w, w.managerA1)).error).toMatch(/42501|propriétaire/);
      expect((await createRiz(ctx, w, w.ownerB)).error).toMatch(/42501|propriétaire/);
    }));

  it("tous les membres de la boutique lisent le catalogue et les prix ; pas les autres", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id } = await createRiz(ctx, w);
      for (const user of [w.managerA1, w.accountantA]) {
        await ctx.as(user);
        expect(await ctx.ids("select id from public.products")).toEqual([id]);
        expect((await ctx.rows("select retail_price from public.product_prices")).length).toBe(1);
      }
      await ctx.as(w.ownerB);
      expect(await ctx.rows("select id from public.products")).toEqual([]);
      await ctx.as(w.admin);
      expect(await ctx.rows("select id from public.price_versions")).toEqual([]);
    }));

  it("le catalogue de départ s'ajoute une seule fois", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      await ctx.as(w.ownerA);
      const [first] = await ctx.rows<{ n: number }>("select public.add_starter_catalog($1) as n", [w.shopA1]);
      expect(first?.n).toBe(7);
      const [again] = await ctx.rows<{ n: number }>("select public.add_starter_catalog($1) as n", [w.shopA1]);
      expect(again?.n).toBe(0);
      await ctx.as(w.managerA1);
      expect((await ctx.tryQuery("select public.add_starter_catalog($1)", [w.shopA1])).error).toMatch(/42501|propriétaire/);
    }));

  it("contenance et unité d'un produit ne changent pas ; le produit ne se supprime pas", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id } = await createRiz(ctx, w);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery("update public.products set capacity_milli = 25000 where id = $1", [id])).error).toMatch(/permission denied/);
      expect((await ctx.tryQuery("delete from public.products where id = $1", [id])).error).toMatch(/permission denied/);
      expect(await ctx.tryQuery("update public.products set name = 'Riz brisé (Thaïlande)' where id = $1", [id])).toEqual({ error: null, rowCount: 1 });
    }));
});

describe("changement de prix (RG4)", () => {
  it("immédiat : la nouvelle grille s'applique, l'ancienne reste dans l'historique", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id } = await createRiz(ctx, w);
      await ctx.as(w.ownerA);
      const formats = JSON.stringify([{ label: "½ kg", quantity_milli: 500, price: 165 }]);
      expect((await ctx.tryQuery("select public.change_price($1, 330, 15500, $2, 'immediate', null)", [id, formats])).error).toBeNull();
      const now = await prices(ctx, id);
      expect(now.retail_price).toBe("330");
      expect(now.formats.map((f) => f.price)).toEqual([165]);
      const history = await ctx.rows<{ retail_price: string; status: string }>("select retail_price, status from public.price_versions where product_id = $1 order by created_at", [id]);
      expect(history).toEqual([
        { retail_price: "315", status: "superseded" },
        { retail_price: "330", status: "active" },
      ]);
    }));

  it("après écoulement : en attente, l'ancien prix reste actif ; une nouvelle attente remplace la précédente", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id } = await createRiz(ctx, w);
      await ctx.as(w.ownerA);
      await ctx.tryQuery("select public.change_price($1, 330, null, '[]', 'after_sellout', null)", [id]);
      expect(await prices(ctx, id)).toMatchObject({ retail_price: "315", pending_retail_price: "330" });
      await ctx.as(w.ownerA);
      await ctx.tryQuery("select public.change_price($1, 340, null, '[]', 'after_sellout', null)", [id]);
      expect(await prices(ctx, id)).toMatchObject({ retail_price: "315", pending_retail_price: "340" });
      await ctx.as(w.ownerA);
      await ctx.tryQuery("select public.cancel_pending_price($1)", [id]);
      expect(await prices(ctx, id)).toMatchObject({ retail_price: "315", pending_retail_price: null });
    }));

  it("seul le propriétaire change un prix ; une grille ne se modifie pas", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id } = await createRiz(ctx, w);
      await ctx.as(w.managerA1);
      expect((await ctx.tryQuery("select public.change_price($1, 1, null, '[]', 'immediate', null)", [id])).error).toMatch(/42501|propriétaire/);
      expect((await ctx.tryQuery("update public.price_versions set retail_price = 1")).error).toMatch(/permission denied/);
      await ctx.asService();
      expect((await ctx.tryQuery("update public.price_versions set retail_price = 1")).error).toMatch(/ne se modifie pas/);
    }));

  it("formats et estimation du reste sont validés", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id } = await createRiz(ctx, w);
      await ctx.as(w.ownerA);
      expect((await ctx.tryQuery(`select public.change_price($1, 330, null, '[{"label":"½ kg","quantity_milli":500,"price":0}]', 'immediate', null)`, [id])).error).toMatch(
        /Format invalide/,
      );
      expect((await ctx.tryQuery("select public.change_price($1, 330, null, '[]', 'immediate', 333)", [id])).error).toMatch(/Estimation/);
    }));
});

describe("prises avec formats (RG3)", () => {
  it("ligne format = nombre × prix du format ; le prix copié ne change pas quand le prix change", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id: product } = await createRiz(ctx, w);
      const customer = randomUUID();
      await ctx.asSystem();
      await ctx.db.query("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'Awa', 'free')", [customer, w.shopA1]);
      await ctx.as(w.managerA1);
      const lines = [
        { label: "Riz brisé ½ kg", product_id: product, quantity_milli: 1000, unit: "kg", unit_price: 160, format_label: "½ kg", format_count: 2 }, // 320
        { label: "Riz brisé", product_id: product, quantity_milli: 250, unit: "kg", unit_price: 315 }, // 78,75 → 80
      ];
      const opId = randomUUID();
      const [row] = await ctx.rows<{ r: { amount: number } }>("select public.record_take($1, $2, 'detailed', null, null, $3, now()) as r", [opId, customer, JSON.stringify(lines)]);
      expect(row?.r.amount).toBe(400);
      await ctx.as(w.ownerA);
      await ctx.tryQuery("select public.change_price($1, 330, null, '[]', 'immediate', null)", [product]);
      const stored = await ctx.rows<{ unit_price: string; line_amount: string; format_count: number | null }>(
        "select unit_price, line_amount, format_count from public.take_lines where operation_id = $1 order by position",
        [opId],
      );
      expect(stored).toEqual([
        { unit_price: "160", line_amount: "320", format_count: 2 },
        { unit_price: "315", line_amount: "80", format_count: null },
      ]);
    }));

  it("refuse un produit d'une autre boutique et un format incohérent", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const { id: product } = await createRiz(ctx, w);
      const customer = randomUUID();
      await ctx.asSystem();
      await ctx.db.query("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'Awa', 'free')", [customer, w.shopA2]);
      await ctx.as(w.ownerA);
      const foreign = [{ label: "Riz", product_id: product, quantity_milli: 1000, unit: "kg", unit_price: 315 }];
      expect((await ctx.tryQuery("select public.record_take($1, $2, 'detailed', null, null, $3, now())", [randomUUID(), customer, JSON.stringify(foreign)])).error).toMatch(
        /Produit inconnu/,
      );
      const wrong = [{ label: "Riz ½ kg", quantity_milli: 500, unit: "kg", unit_price: 160, format_label: "½ kg", format_count: 1, line_amount: 158 }];
      expect((await ctx.tryQuery("select public.record_take($1, $2, 'detailed', null, null, $3, now())", [randomUUID(), customer, JSON.stringify(wrong)])).error).toMatch(
        /incohérent/,
      );
    }));
});
