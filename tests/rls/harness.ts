// Banc de test RLS sur la base Supabase distante.
// Chaque scénario s'exécute dans une transaction ANNULÉE à la fin : rien n'est conservé.
// On simule un utilisateur comme le fait PostgREST : rôle « authenticated » + claims JWT.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { databaseUrl } from "../../scripts/lib/env";

export type Db = pg.ClientBase;

let client: pg.Client | null = null;

export async function connect(): Promise<void> {
  client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
}

export async function disconnect(): Promise<void> {
  await client?.end();
  client = null;
}

/** Exécute un scénario dans une transaction toujours annulée. */
export async function scenario<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  if (!client) throw new Error("connect() d'abord");
  const db = client;
  await db.query("begin");
  try {
    return await fn(new Ctx(db));
  } finally {
    await db.query("rollback");
  }
}

export class Ctx {
  constructor(readonly db: Db) {}

  /** Repasse en rôle postgres (propriétaire des tables, sans RLS) pour préparer les données. */
  async asSystem(): Promise<void> {
    await this.db.query("reset role");
    await this.db.query("select set_config('request.jwt.claims', '', true)");
  }

  /** Agit comme le serveur (clé secrète → rôle service_role, sans auth.uid()). */
  async asService(): Promise<void> {
    await this.db.query("reset role");
    await this.db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    await this.db.query("set local role service_role");
  }

  /** Agit comme un utilisateur connecté (ou anonyme si userId est null). */
  async as(userId: string | null): Promise<void> {
    await this.db.query("reset role");
    if (userId) {
      await this.db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await this.db.query("set local role authenticated");
    } else {
      await this.db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      await this.db.query("set local role anon");
    }
  }

  async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.db.query("savepoint q");
    try {
      const result = await this.db.query(sql, params);
      await this.db.query("release savepoint q");
      return result.rows as T[];
    } catch (error) {
      await this.db.query("rollback to savepoint q");
      throw error;
    }
  }

  /** Exécute une requête et renvoie l'erreur Postgres (ou null), sans casser la transaction. */
  async tryQuery(sql: string, params: unknown[] = []): Promise<{ error: string | null; rowCount: number }> {
    try {
      await this.db.query("savepoint t");
      const result = await this.db.query(sql, params);
      await this.db.query("release savepoint t");
      return { error: null, rowCount: result.rowCount ?? 0 };
    } catch (error) {
      await this.db.query("rollback to savepoint t");
      return { error: (error as Error).message, rowCount: 0 };
    }
  }

  async ids(sql: string, params: unknown[] = []): Promise<string[]> {
    return (await this.rows<{ id: string }>(sql, params)).map((r) => r.id).sort();
  }
}

export interface World {
  tenantA: string;
  tenantB: string;
  shopA1: string;
  shopA2: string;
  shopB1: string;
  ownerA: string;
  managerA1: string; // rattaché à A1 seulement
  accountantA: string; // rattaché à A1 et A2
  disabledManagerA: string; // rattaché à A1, profil désactivé
  ownerB: string;
  managerB1: string;
  admin: string;
}

let phoneCounter = 0;
function fakePhone(): string {
  phoneCounter += 1;
  return `+22170${String(9_000_000 + phoneCounter).padStart(7, "0")}`;
}

/**
 * Deux propriétaires, trois boutiques, des employés de chaque rôle, un admin.
 * Tout est inséré en une seule requête (la base distante est à ~100 ms) ;
 * les identifiants sont des UUID générés ici, donc sûrs à interpoler.
 */
export async function seedWorld(ctx: Ctx): Promise<World> {
  await ctx.asSystem();
  const w = {} as World;
  const users = ["ownerA", "managerA1", "accountantA", "disabledManagerA", "ownerB", "managerB1", "admin"] as const;
  for (const key of [...users, "tenantA", "tenantB", "shopA1", "shopA2", "shopB1"] as const) w[key] = randomUUID();

  const authUsers = users
    .map(
      (key) =>
        `('00000000-0000-0000-0000-000000000000', '${w[key]}', 'authenticated', 'authenticated', 'rls-${key}-${w[key].slice(0, 8)}@test.bitig.invalid', '', now(), now(), now(), '{}', '{}')`,
    )
    .join(",\n");
  const profiles: [keyof World, keyof World, string, string, string][] = [
    ["ownerA", "tenantA", "owner", "Owner A", "active"],
    ["managerA1", "tenantA", "manager", "Manager A1", "active"],
    ["accountantA", "tenantA", "accountant", "Accountant A", "active"],
    ["disabledManagerA", "tenantA", "manager", "Disabled A", "disabled"],
    ["ownerB", "tenantB", "owner", "Owner B", "active"],
    ["managerB1", "tenantB", "manager", "Manager B1", "active"],
  ];
  const members: [keyof World, keyof World, keyof World][] = [
    ["shopA1", "managerA1", "tenantA"],
    ["shopA1", "accountantA", "tenantA"],
    ["shopA2", "accountantA", "tenantA"],
    ["shopA1", "disabledManagerA", "tenantA"],
    ["shopB1", "managerB1", "tenantB"],
  ];

  await ctx.db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ${authUsers};
    insert into public.tenants (id, name) values ('${w.tenantA}', 'Propriétaire A'), ('${w.tenantB}', 'Propriétaire B');
    insert into public.shops (id, tenant_id, name) values
      ('${w.shopA1}', '${w.tenantA}', 'Boutique A1'), ('${w.shopA2}', '${w.tenantA}', 'Boutique A2'), ('${w.shopB1}', '${w.tenantB}', 'Boutique B1');
    insert into public.profiles (user_id, tenant_id, role, full_name, status) values
      ${profiles.map(([u, t, role, name, status]) => `('${w[u]}', '${w[t]}', '${role}', '${name}', '${status}')`).join(", ")};
    insert into public.profile_contacts (user_id, tenant_id, phone_e164) values
      ${profiles.map(([u, t]) => `('${w[u]}', '${w[t]}', '${fakePhone()}')`).join(", ")};
    insert into public.shop_members (shop_id, user_id, tenant_id) values
      ${members.map(([s, u, t]) => `('${w[s]}', '${w[u]}', '${w[t]}')`).join(", ")};
    insert into public.platform_admins (user_id, full_name, phone_e164) values ('${w.admin}', 'Admin', '${fakePhone()}');
  `);
  return w;
}

export const sorted = (...ids: string[]) => [...ids].sort();
