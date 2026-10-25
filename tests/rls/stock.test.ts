// Jalon 5b : stock (réception, ouverture FIFO, fin, vente entière, ajustement), bilans de sac, RG4, annulations.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, scenario, seedWorld, type Ctx, type World } from "./harness";

beforeAll(connect);
afterAll(disconnect);

async function product(ctx: Ctx, w: World, retail = 315, packagePrice: number | null = 15000) {
  const id = randomUUID();
  await ctx.as(w.ownerA);
  const result = await ctx.tryQuery("select public.create_product($1, $2, 'Riz brisé', null, 'sac', 'kg', 50000, 1, $3, $4, '[]')", [id, w.shopA1, retail, packagePrice]);
  expect(result.error).toBeNull();
  return id;
}

const call = (ctx: Ctx, sql: string, params: unknown[]) => ctx.tryQuery(sql, params);
const receive = (ctx: Ctx, productId: string, count = 1, price = 14400, id = randomUUID()) =>
  call(ctx, "select public.receive_lot($1, $2, $3, $4, null, now())", [id, productId, count, price]);
const open = (ctx: Ctx, productId: string, id = randomUUID()) => call(ctx, "select public.open_package($1, $2, now())", [id, productId]);
const finish = (ctx: Ctx, productId: string, id = randomUUID()) => call(ctx, "select public.finish_package($1, $2, now())", [id, productId]);

async function counts(ctx: Ctx, productId: string) {
  await ctx.asSystem();
  const rows = await ctx.rows<{ state: string; n: string }>("select state, count(*) n from public.packages where product_id = $1 group by state", [productId]);
  return Object.fromEntries(rows.map((r) => [r.state, Number(r.n)]));
}

async function review(ctx: Ctx, productId: string) {
  await ctx.asSystem();
  const [row] = await ctx.rows<Record<string, string>>(
    "select expected_revenue, account_takes, estimated_cash_sales, cost, gross_margin from public.package_reviews where product_id = $1",
    [productId],
  );
  return row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

describe("bilan de sac (RG2)", () => {
  it("exemple du cahier : sac de riz 50 kg acheté 14 400 F, 315 F/kg, prises détaillées 2 205 F", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.managerA1);
      expect((await receive(ctx, riz)).error).toBeNull();
      expect((await open(ctx, riz)).error).toBeNull();
      const customer = randomUUID();
      await ctx.asSystem();
      await ctx.db.query("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'Awa', 'free')", [customer, w.shopA1]);
      await ctx.as(w.managerA1);
      const lines = (q: number) => JSON.stringify([{ label: "Riz", product_id: riz, quantity_milli: q, unit: "kg", unit_price: 315 }]);
      for (const q of [1000, 1000, 5000]) {
        expect((await call(ctx, "select public.record_take($1, $2, 'detailed', null, null, $3, now())", [randomUUID(), customer, lines(q)])).error).toBeNull();
      }
      // Une prise rapide n'est rattachée à aucun sac : elle ne réduit pas le comptant estimé.
      await call(ctx, "select public.record_take($1, $2, 'quick', 5000, 'riz', null, now())", [randomUUID(), customer]);
      expect((await finish(ctx, riz)).error).toBeNull();
      expect(await review(ctx, riz)).toEqual({ expected_revenue: 15750, account_takes: 2205, estimated_cash_sales: 13545, cost: 14400, gross_margin: 1350 });
    }));

  it("exemple du cahier : baisse immédiate de 330 à 315 F/kg à mi-sac → 8 250 + 7 875 = 16 125 F", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w, 330);
      await ctx.as(w.ownerA);
      await receive(ctx, riz);
      await open(ctx, riz);
      expect((await call(ctx, "select public.change_price($1, 315, null, '[]', 'immediate', null)", [riz])).error).toMatch(/Estimez le reste/);
      expect((await call(ctx, "select public.change_price($1, 315, null, '[]', 'immediate', 500)", [riz])).error).toBeNull();
      await finish(ctx, riz);
      expect((await review(ctx, riz))?.expected_revenue).toBe(16125);
    }));

  it("deux changements : le reste estimé ne remonte pas ; presque vide = 10 %", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w, 300);
      await ctx.as(w.ownerA);
      await receive(ctx, riz);
      await open(ctx, riz);
      await call(ctx, "select public.change_price($1, 320, null, '[]', 'immediate', 500)", [riz]);
      expect((await call(ctx, "select public.change_price($1, 340, null, '[]', 'immediate', 750)", [riz])).error).toMatch(/ne peut pas dépasser/);
      await call(ctx, "select public.change_price($1, 340, null, '[]', 'immediate', 100)", [riz]);
      await finish(ctx, riz);
      // 25 kg × 300 + 20 kg × 320 + 5 kg × 340 = 7 500 + 6 400 + 1 700
      expect((await review(ctx, riz))?.expected_revenue).toBe(15600);
    }));
});

describe("politique après écoulement (RG4)", () => {
  it("l'ancien stock garde l'ancien prix ; le nouveau s'applique à l'ouverture du premier sac reçu après le changement", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w, 315);
      // Lot A reçu avant le changement de prix (horodatages explicites : une transaction de test a une seule heure).
      const lotA = randomUUID();
      await ctx.asSystem();
      await ctx.db.query(
        `insert into public.lots (id, shop_id, product_id, package_count, purchase_price, received_at, server_created_at, created_by)
         values ($1, $2, $3, 1, 14400, now() - interval '2 hours', now() - interval '2 hours', $4)`,
        [lotA, w.shopA1, riz, w.ownerA],
      );
      await ctx.db.query("insert into public.packages (shop_id, product_id, lot_id, seq) values ($1, $2, $3, 1)", [w.shopA1, riz, lotA]);
      await ctx.db.query(
        `insert into public.price_versions (shop_id, product_id, retail_price, mode, status, created_at, created_by) values ($1, $2, 330, 'after_sellout', 'pending', now() - interval '1 hour', $3)`,
        [w.shopA1, riz, w.ownerA],
      );
      await ctx.as(w.managerA1);
      await open(ctx, riz); // sac du lot A : ancien prix
      await ctx.asSystem();
      const priceOf = async () => (await ctx.rows<{ retail_price: string; pending_retail_price: string | null }>("select retail_price, pending_retail_price from public.product_prices where product_id = $1", [riz]))[0];
      expect(await priceOf()).toEqual({ retail_price: "315", pending_retail_price: "330" });
      await ctx.as(w.managerA1);
      await finish(ctx, riz);
      await receive(ctx, riz); // lot B, reçu après le changement
      const [opened] = await ctx.rows<{ r: { retail_price: number; price_activated: boolean } }>("select public.open_package($1, $2, now()) as r", [randomUUID(), riz]);
      expect(opened?.r).toMatchObject({ retail_price: 330, price_activated: true });
      await ctx.asSystem();
      expect(await priceOf()).toEqual({ retail_price: "330", pending_retail_price: null });
    }));
});

describe("mouvements", () => {
  it("FIFO : le sac du lot le plus ancien s'ouvre d'abord ; un seul sac entamé par produit", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.managerA1);
      const lotOld = randomUUID();
      await ctx.asSystem();
      await ctx.db.query(
        `insert into public.lots (id, shop_id, product_id, package_count, purchase_price, received_at, created_by) values ($1, $2, $3, 1, 14000, now() - interval '3 days', $4)`,
        [lotOld, w.shopA1, riz, w.managerA1],
      );
      await ctx.db.query("insert into public.packages (shop_id, product_id, lot_id, seq) values ($1, $2, $3, 1)", [w.shopA1, riz, lotOld]);
      await ctx.as(w.managerA1);
      await receive(ctx, riz, 2, 14400);
      const [opened] = await ctx.rows<{ r: { package_id: string } }>("select public.open_package($1, $2, now()) as r", [randomUUID(), riz]);
      await ctx.asSystem();
      const [pkg] = await ctx.rows<{ lot_id: string }>("select lot_id from public.packages where id = $1", [opened!.r.package_id]);
      expect(pkg?.lot_id).toBe(lotOld);
      await ctx.as(w.managerA1);
      expect((await open(ctx, riz)).error).toMatch(/déjà entamé/);
      expect(await counts(ctx, riz)).toEqual({ opened: 1, closed: 2 });
    }));

  it("sans sac fermé ou entamé : refus explicite", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.managerA1);
      expect((await open(ctx, riz)).error).toMatch(/Aucun conditionnement fermé/);
      expect((await finish(ctx, riz)).error).toMatch(/Aucun conditionnement entamé/);
    }));

  it("vente entière sur compte : crée la prise ; l'annuler remet le sac en stock et annule la prise", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      const customer = randomUUID();
      await ctx.asSystem();
      await ctx.db.query("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'Awa', 'free')", [customer, w.shopA1]);
      await ctx.as(w.managerA1);
      await receive(ctx, riz, 2);
      const sale = randomUUID();
      const take = randomUUID();
      expect((await call(ctx, "select public.sell_whole_package($1, $2, 15000, $3, $4, now())", [sale, riz, customer, take])).error).toBeNull();
      await ctx.asSystem();
      const balance = async () => Number((await ctx.rows<{ balance: string }>("select balance from public.customer_balances where customer_id = $1", [customer]))[0]?.balance);
      expect(await balance()).toBe(-15000);
      expect(await counts(ctx, riz)).toEqual({ closed: 1, sold_whole: 1 });
      await ctx.as(w.managerA1);
      expect((await call(ctx, "select public.cancel_stock_movement($1, $2, 'erreur', now())", [randomUUID(), sale])).error).toBeNull();
      expect(await counts(ctx, riz)).toEqual({ closed: 2 });
      expect(await balance()).toBe(0);
    }));

  it("ajustement d'inventaire : manquant et trouvé", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.managerA1);
      await receive(ctx, riz, 3);
      expect((await call(ctx, "select public.adjust_stock($1, $2, -1, 'sac abîmé', null, now())", [randomUUID(), riz])).error).toBeNull();
      expect(await counts(ctx, riz)).toEqual({ closed: 2, removed: 1 });
      await ctx.as(w.managerA1);
      expect((await call(ctx, "select public.adjust_stock($1, $2, 2, 'oubli de saisie', null, now())", [randomUUID(), riz])).error).toBeNull();
      expect(await counts(ctx, riz)).toEqual({ closed: 4, removed: 1 });
      await ctx.as(w.managerA1);
      expect((await call(ctx, "select public.adjust_stock($1, $2, -9, null, null, now())", [randomUUID(), riz])).error).toMatch(/Pas assez/);
    }));

  it("idempotence : un renvoi du même mouvement ne refait rien", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.managerA1);
      const id = randomUUID();
      await receive(ctx, riz, 2, 14400, id);
      await receive(ctx, riz, 2, 14400, id);
      expect(await counts(ctx, riz)).toEqual({ closed: 2 });
    }));

  it("la prise d'un produit est rattachée au sac entamé à ce moment-là", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      const customer = randomUUID();
      await ctx.asSystem();
      await ctx.db.query("insert into public.customers (id, shop_id, full_name, type) values ($1, $2, 'Awa', 'free')", [customer, w.shopA1]);
      await ctx.as(w.managerA1);
      await receive(ctx, riz);
      const [opened] = await ctx.rows<{ r: { package_id: string } }>("select public.open_package($1, $2, now()) as r", [randomUUID(), riz]);
      const op = randomUUID();
      await call(ctx, "select public.record_take($1, $2, 'detailed', null, null, $3, now())", [op, customer, JSON.stringify([{ label: "Riz", product_id: riz, quantity_milli: 1000, unit: "kg", unit_price: 315 }])]);
      // Prise datée d'avant l'ouverture (saisie hors ligne la veille) : pas de sac entamé alors.
      const before = randomUUID();
      await call(ctx, "select public.record_take($1, $2, 'detailed', null, null, $3, now() - interval '1 day')", [
        before,
        customer,
        JSON.stringify([{ label: "Riz", product_id: riz, quantity_milli: 1000, unit: "kg", unit_price: 315 }]),
      ]);
      await ctx.asSystem();
      const pkgOf = async (id: string) => (await ctx.rows<{ package_id: string | null }>("select package_id from public.take_lines where operation_id = $1", [id]))[0]?.package_id;
      expect(await pkgOf(op)).toBe(opened!.r.package_id);
      expect(await pkgOf(before)).toBeNull();
    }));
});

describe("annulations de mouvements (mêmes règles que les prises)", () => {
  it("gérant : son propre mouvement dans le délai ; celui d'un autre → demande, validée par le propriétaire", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.ownerA);
      const reception = randomUUID();
      await receive(ctx, riz, 2, 14400, reception);
      await ctx.as(w.managerA1);
      const openId = randomUUID();
      await open(ctx, riz, openId);
      expect((await call(ctx, "select public.cancel_stock_movement($1, $2, null, now())", [randomUUID(), openId])).error).toBeNull();
      expect(await counts(ctx, riz)).toEqual({ closed: 2 });
      await ctx.as(w.managerA1);
      expect((await call(ctx, "select public.cancel_stock_movement($1, $2, null, now())", [randomUUID(), reception])).error).toMatch(/demande d'annulation/);
      const requestId = randomUUID();
      expect((await call(ctx, "select public.request_stock_cancellation($1, $2, 'mauvais produit', now())", [requestId, reception])).error).toBeNull();
      await ctx.as(w.ownerA);
      expect((await call(ctx, "select public.decide_cancellation($1, true, null, null)", [requestId])).error).toBeNull();
      expect(await counts(ctx, riz)).toEqual({ removed: 2 });
    }));

  it("une réception dont un sac est entamé ne s'annule pas ; une annulation ne s'annule pas", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      await ctx.as(w.ownerA);
      const reception = randomUUID();
      await receive(ctx, riz, 1, 14400, reception);
      await open(ctx, riz);
      expect((await call(ctx, "select public.cancel_stock_movement($1, $2, null, now())", [randomUUID(), reception])).error).toMatch(/déjà entamés/);
      const finishId = randomUUID();
      await finish(ctx, riz, finishId);
      const cancelId = randomUUID();
      expect((await call(ctx, "select public.cancel_stock_movement($1, $2, null, now())", [cancelId, finishId])).error).toBeNull();
      expect(await counts(ctx, riz)).toEqual({ opened: 1 });
      await ctx.as(w.ownerA);
      expect((await call(ctx, "select public.cancel_stock_movement($1, $2, null, now())", [randomUUID(), cancelId])).error).toMatch(/ne s'annule pas/);
    }));
});

describe("droits et immuabilité", () => {
  it("le comptable et l'autre propriétaire ne touchent pas au stock ; personne ne modifie le journal", () =>
    scenario(async (ctx) => {
      const w = await seedWorld(ctx);
      const riz = await product(ctx, w);
      for (const user of [w.accountantA, w.ownerB]) {
        await ctx.as(user);
        expect((await receive(ctx, riz)).error).toMatch(/42501|Seuls/);
      }
      await ctx.as(w.ownerB);
      expect(await ctx.rows("select id from public.packages")).toEqual([]);
      await ctx.as(w.ownerA);
      await receive(ctx, riz);
      expect((await ctx.tryQuery("update public.packages set state = 'opened'")).error).toMatch(/permission denied/);
      expect((await ctx.tryQuery("delete from public.stock_movements")).error).toMatch(/permission denied/);
      await ctx.asService();
      expect((await ctx.tryQuery("update public.stock_movements set quantity = 9")).error).toMatch(/immuable/);
      expect((await ctx.tryQuery("delete from public.lots")).error).toMatch(/immuable/);
    }));
});
