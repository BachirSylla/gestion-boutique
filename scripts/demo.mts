// Jeu de données de démonstration (CLAUDE.md §11), activable à la demande, jamais créé automatiquement.
//   pnpm demo:seed -- --confirm   crée « [démo] Fatou Diallo » : Boutique Keur Fatou, gérant Moussa, 4 produits, 4 clients
//   pnpm demo:reset -- --confirm  supprime ce propriétaire de démonstration et toutes ses données (et rien d'autre)
// --dry-run : tout est fait puis annulé (vérification du script, rien ne reste dans la base).
// Options : --owner-phone "70 000 00 01" --manager-phone "70 000 00 02" (numéros de connexion, aucun SMS envoyé).
// Les écritures passent par les fonctions métier de la base, au nom de Fatou ou de Moussa, avec des heures d'appareil
// étalées sur trois semaines : soldes, bilans de sac et clôtures sont ceux que l'application aurait produits.
// Les mots de passe sont générés et affichés une seule fois dans le terminal, jamais enregistrés.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { loginEmailFromPhone, normalizePhone } from "../src/shared/domain/phone";
import { databaseUrl, requireEnv } from "./lib/env";

export const DEMO_TENANT_PREFIX = "[démo] ";
const TENANT_NAME = `${DEMO_TENANT_PREFIX}Fatou Diallo`;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2];
if (command !== "seed" && command !== "reset") {
  console.error("Usage : pnpm demo:seed -- --confirm | pnpm demo:reset -- --confirm");
  process.exit(1);
}
if (!process.argv.includes("--confirm")) {
  console.error(`Ajoutez --confirm : cette commande écrit dans la base distante (projet ${requireEnv("SUPABASE_PROJECT_REF")}).`);
  process.exit(1);
}

const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
await db.connect();

async function demoTenants(): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>("select id from public.tenants where name = $1", [TENANT_NAME]);
  return rows.map((r) => r.id);
}


async function reset() {
  const tenants = await demoTenants();
  if (!tenants.length) {
    console.log("Aucune donnée de démonstration.");
    return;
  }
  for (const tenantId of tenants) {
    await db.query("begin");
    const { rows } = await db.query<{ user_id: string }>("select private.purge_tenant($1) as user_id", [tenantId]);
    await db.query("commit");
    for (const { user_id } of rows) {
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) console.error(`Compte ${user_id} non supprimé : ${error.message}`);
    }
  }
  console.log("Données de démonstration supprimées.");
}

async function seed() {
  if ((await demoTenants()).length) {
    console.log("Les données de démonstration existent déjà. Pour repartir de zéro : pnpm demo:reset -- --confirm");
    return;
  }
  const ownerPhone = normalizePhone(arg("owner-phone") ?? "70 000 00 01");
  const managerPhone = normalizePhone(arg("manager-phone") ?? "70 000 00 02");
  if (!ownerPhone || !managerPhone || ownerPhone === managerPhone) throw new Error("Numéros de connexion invalides.");

  const created: string[] = [];
  const users: { label: string; phone: string; password: string; id: string }[] = [];
  try {
    for (const [label, phone, fullName] of [
      ["Propriétaire", ownerPhone, "Fatou Diallo"],
      ["Gérant", managerPhone, "Moussa Ndiaye"],
    ] as const) {
      const password = randomBytes(9).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email: loginEmailFromPhone(phone), password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error) throw new Error(`${label} : ${error.message} (numéro déjà utilisé ? choisissez --${label === "Gérant" ? "manager" : "owner"}-phone)`);
      created.push(data.user.id);
      users.push({ label, phone, password, id: data.user.id });
    }
    await db.query("begin");
    await populate(users[0]!.id, ownerPhone, users[1]!.id, managerPhone);
    await summary();
    if (process.argv.includes("--dry-run")) throw new DryRun();
    await db.query("commit");
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    for (const id of created) await admin.auth.admin.deleteUser(id);
    if (error instanceof DryRun) {
      console.log("Essai à blanc : tout a été annulé.");
      return;
    }
    throw error;
  }

  console.log("Données de démonstration créées : « Boutique Keur Fatou » (Médina, Dakar).");
  for (const u of users) console.log(`  ${u.label} : ${u.phone} · mot de passe : ${u.password}`);
  console.log("Notez ces mots de passe : ils ne seront plus affichés. Suppression : pnpm demo:reset -- --confirm");
}

class DryRun extends Error {}

/** Résumé de ce qui a été créé (soldes, stock, bilans, clôtures). */
async function summary() {
  await asSystem();
  const { rows: balances } = await db.query<{ full_name: string; balance: string }>(
    `select c.full_name, coalesce(sum(case o.kind when 'payment' then o.amount when 'take' then -o.amount end) filter (
        where o.kind <> 'cancellation' and not exists (select 1 from public.customer_operations x where x.cancels_operation_id = o.id)), 0) balance
     from public.customers c left join public.customer_operations o on o.customer_id = c.id
     join public.tenants t on t.name = $1 join public.shops s on s.tenant_id = t.id and s.id = c.shop_id
     group by c.full_name order by c.full_name`,
    [TENANT_NAME],
  );
  for (const b of balances) console.log(`  ${b.full_name} : ${b.balance} F`);
  const { rows: reviews } = await db.query<{ name: string; expected_revenue: string; gross_margin: string }>(
    `select p.name, r.expected_revenue, r.gross_margin from public.package_reviews r join public.products p on p.id = r.product_id
     join public.shops s on s.id = r.shop_id join public.tenants t on t.id = s.tenant_id and t.name = $1 order by r.finished_at`,
    [TENANT_NAME],
  );
  for (const r of reviews) console.log(`  Bilan ${r.name} : attendu ${r.expected_revenue} F, marge ${r.gross_margin} F`);
}

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

const NOW = Date.now();
const DAY = 86_400_000;
/** Il y a `days` jours, à hh:mm à Dakar (UTC+0). */
function at(days: number, hh: number, mm = 0): string {
  const d = new Date(NOW - days * DAY);
  d.setUTCHours(hh, mm, 0, 0);
  return d.toISOString();
}

async function as(userId: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await db.query("set local role authenticated");
}

async function asSystem() {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true)");
}

async function call(sql: string, params: unknown[]) {
  await db.query(sql, params);
}

async function populate(ownerId: string, ownerPhone: string, managerId: string, managerPhone: string) {
  await asSystem();
  const tenantId = randomUUID();
  const shopId = randomUUID();
  await db.query("insert into public.tenants (id, name) values ($1, $2)", [tenantId, TENANT_NAME]);
  await db.query("insert into public.shops (id, tenant_id, name, district, city, created_by) values ($1, $2, 'Boutique Keur Fatou', 'Médina', 'Dakar', $3)", [shopId, tenantId, ownerId]);
  await db.query(
    `insert into public.profiles (user_id, tenant_id, role, full_name, status, must_change_password) values
       ($1, $3, 'owner', 'Fatou Diallo', 'active', false), ($2, $3, 'manager', 'Moussa Ndiaye', 'active', false)`,
    [ownerId, managerId, tenantId],
  );
  await db.query("insert into public.profile_contacts (user_id, tenant_id, phone_e164) values ($1, $3, $4), ($2, $3, $5)", [ownerId, managerId, tenantId, ownerPhone, managerPhone]);
  await db.query("insert into public.shop_members (shop_id, user_id, tenant_id) values ($1, $2, $3)", [shopId, managerId, tenantId]);
  const { rows: methods } = await db.query<{ id: string; kind: string }>("select id, kind from public.payment_methods where shop_id = $1", [shopId]);
  const method = (kind: string) => methods.find((m) => m.kind === kind)!.id;

  // Catalogue (propriétaire).
  await as(ownerId);
  const product = async (name: string, label: string, unit: string, capacity: number, retail: number, packagePrice: number, formats: [string, number, number][]) => {
    const id = randomUUID();
    const f = formats.map(([l, q, price]) => ({ label: l, quantity_milli: q, price }));
    await call("select public.create_product($1, $2, $3, null, $4, $5, $6, 1, $7, $8, $9::jsonb)", [id, shopId, name, label, unit, capacity, retail, packagePrice, JSON.stringify(f)]);
    return id;
  };
  const riz = await product("Riz brisé", "sac", "kg", 50_000, 315, 15_000, [["1 kg", 1000, 315], ["½ kg", 500, 160]]);
  const huile = await product("Huile", "bidon", "l", 20_000, 1_100, 21_000, [["1 L", 1000, 1100], ["½ L", 500, 550]]);
  const sucre = await product("Sucre", "sac", "kg", 50_000, 600, 30_000, [["1 kg", 1000, 600], ["½ kg", 500, 300]]);
  const lait = await product("Lait en sachet", "carton", "piece", 25_000, 250, 6_000, [["1 sachet", 1000, 250]]);

  // Stock (gérant) : réception il y a 20 jours, ouverture de chaque produit.
  await as(managerId);
  const receive = (p: string, n: number, price: number, t: string) => call("select public.receive_lot($1, $2, $3, $4, null, $5)", [randomUUID(), p, n, price, t]);
  const open = (p: string, t: string) => call("select public.open_package($1, $2, $3)", [randomUUID(), p, t]);
  const finish = (p: string, t: string) => call("select public.finish_package($1, $2, $3)", [randomUUID(), p, t]);
  await receive(riz, 4, 14_400, at(20, 8));
  await receive(huile, 2, 20_000, at(20, 8, 5));
  await receive(sucre, 3, 28_000, at(20, 8, 10));
  await receive(lait, 3, 5_500, at(20, 8, 15));
  for (const p of [riz, huile, sucre, lait]) await open(p, at(20, 8, 30));

  // Clients (fiches saisies par le gérant ; pas de téléphone : la démo n'écrit à personne).
  await asSystem();
  const customer = async (name: string, type: string, limit: number | null) => {
    const id = randomUUID();
    await db.query("insert into public.customers (id, shop_id, full_name, type, credit_limit, created_at, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $7)", [
      id,
      shopId,
      name,
      type,
      limit,
      at(20, 9),
      managerId,
    ]);
    return id;
  };
  const awa = await customer("Awa Ndiaye", "monthly", 25_000);
  const ibrahima = await customer("Ibrahima Fall", "free", 20_000);
  const mariama = await customer("Mariama Sow", "advance", null);
  const cheikh = await customer("Cheikh Diop", "free", null);

  await as(managerId);
  type Line = [string, string, number, number]; // produit, format, nombre, prix du format
  const names: Record<string, string> = { [riz]: "Riz brisé", [huile]: "Huile", [sucre]: "Sucre", [lait]: "Lait en sachet" };
  const units: Record<string, string> = { [riz]: "kg", [huile]: "l", [sucre]: "kg", [lait]: "piece" };
  const sizes: Record<string, number> = { "1 kg": 1000, "½ kg": 500, "1 L": 1000, "½ L": 500, "1 sachet": 1000 };
  const detailed = (c: string, t: string, lines: Line[]) =>
    call("select public.record_take($1, $2, 'detailed', null, null, $3::jsonb, $4)", [
      randomUUID(),
      c,
      JSON.stringify(
        lines.map(([p, format, count, price]) => ({
          label: `${names[p]} ${format}`,
          product_id: p,
          format_label: format,
          format_count: count,
          quantity_milli: sizes[format]! * count,
          unit: units[p],
          unit_price: price,
        })),
      ),
      t,
    ]);
  const quick = (c: string, t: string, amount: number, note: string) => call("select public.record_take($1, $2, 'quick', $3, $4, null, $5)", [randomUUID(), c, amount, note, t]);
  const pay = (c: string, t: string, amount: number, kind: string) => call("select public.record_payment($1, $2, $3, $4, null, $5)", [randomUUID(), c, amount, method(kind), t]);

  // Mariama : avance de 10 000 F presque épuisée.
  await pay(mariama, at(17, 10), 10_000, "cash");
  await detailed(mariama, at(16, 11), [[riz, "½ kg", 2, 160]]);
  await quick(mariama, at(12, 9, 40), 4_000, "pain + savon");
  await detailed(mariama, at(8, 17), [[sucre, "1 kg", 3, 600]]);
  await quick(mariama, at(4, 18, 20), 3_000, "condiments");
  // Ibrahima : crédit libre, plafond de 20 000 F dépassé.
  await quick(ibrahima, at(19, 12), 8_000, "riz + huile");
  await call("select public.record_take($1, $2, 'detailed', null, null, $3::jsonb, $4)", [
    randomUUID(),
    ibrahima,
    JSON.stringify([{ label: "Riz brisé", product_id: riz, quantity_milli: 5000, unit: "kg", unit_price: 315 }]),
    at(15, 10),
  ]);
  await quick(ibrahima, at(11, 19), 6_000, "gaz + sucre");
  await detailed(ibrahima, at(7, 8, 30), [[huile, "1 L", 2, 1_100]]);
  await quick(ibrahima, at(3, 13), 5_000, "lait + café");
  // Awa : crédit mensuel, plafond 25 000 F.
  await detailed(awa, at(18, 9), [
    [riz, "1 kg", 2, 315],
    [huile, "½ L", 1, 550],
  ]);
  await detailed(awa, at(14, 18), [
    [sucre, "1 kg", 2, 600],
    [lait, "1 sachet", 4, 250],
  ]);
  await pay(awa, at(12, 19), 5_000, "wave");
  await quick(awa, at(10, 12, 15), 3_500, "pain + savon");
  await detailed(awa, at(6, 9, 30), [
    [riz, "1 kg", 3, 315],
    [huile, "1 L", 1, 1_100],
  ]);
  await quick(awa, at(2, 17, 45), 1_500, "condiments");
  // Cheikh : crédit libre, versement récent.
  await quick(cheikh, at(9, 11), 4_500, "riz + oignon");
  await pay(cheikh, at(5, 18), 2_000, "orange_money");

  // Fins de sac et ouvertures suivantes (bilans de sac), un sac de sucre vendu entier au comptant.
  await finish(lait, at(12, 20));
  await open(lait, at(12, 20, 5));
  await finish(riz, at(13, 19));
  await open(riz, at(13, 19, 5));
  await call("select public.sell_whole_package($1, $2, 30000, null, null, $3)", [randomUUID(), sucre, at(11, 10)]);
  await finish(sucre, at(9, 18));
  await open(sucre, at(9, 18, 5));
  await finish(huile, at(8, 19));
  await open(huile, at(8, 19, 5));
  await finish(riz, at(6, 18));
  await open(riz, at(6, 18, 5));

  // Clôtures des trois derniers jours : tout l'argent reçu par moyen.
  const close = (days: number, amounts: [string, number][]) =>
    call("select public.record_day_closing($1, $2, ($3::timestamptz at time zone 'Africa/Dakar')::date, $4::jsonb, null, $3)", [
      randomUUID(),
      shopId,
      at(days, 21),
      JSON.stringify(amounts.map(([kind, amount]) => ({ payment_method_id: method(kind), amount }))),
    ]);
  await close(3, [
    ["cash", 16_500],
    ["wave", 6_000],
    ["orange_money", 1_500],
  ]);
  await close(2, [
    ["cash", 21_000],
    ["wave", 3_000],
  ]);
  await close(1, [
    ["cash", 18_000],
    ["wave", 4_500],
    ["orange_money", 2_000],
  ]);

  // Hausse du riz à 330 F/kg après écoulement de l'ancien stock : « hausse en attente ».
  await as(ownerId);
  await call("select public.change_price($1, 330, 15500, $2::jsonb, 'after_sellout')", [
    riz,
    JSON.stringify([
      { label: "1 kg", quantity_milli: 1000, price: 330 },
      { label: "½ kg", quantity_milli: 500, price: 165 },
    ]),
  ]);
  await asSystem();
}

// Exécution (en fin de fichier : toutes les déclarations sont initialisées).
try {
  if (command === "reset") await reset();
  else await seed();
} finally {
  await db.end();
}
