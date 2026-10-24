// Comptes de test éphémères pour les parcours de bout en bout, sur le projet distant.
// Créés par global-setup, supprimés par global-teardown (et au démarrage s'il en reste).
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loginEmailFromPhone } from "../../src/shared/domain/phone";
import pg from "pg";
import { databaseUrl, requireEnv } from "../../scripts/lib/env";

export const E2E_TENANT_PREFIX = "[e2e] ";
const FIXTURE_FILE = "test-results/e2e-fixture.json";

export interface E2eUser {
  id: string;
  phone: string;
  /** Saisie « humaine » du numéro, ex. « 70 912 34 56 ». */
  phoneInput: string;
  password: string;
  fullName: string;
}

export interface E2eFixture {
  tenantId: string;
  shopIds: string[];
  owner: E2eUser;
  disabledManager: E2eUser;
  manager: E2eUser;
  platformAdmin: E2eUser;
}

export function admin() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("Réponse vide de Supabase");
  return result.data;
}

/** Numéro de test aléatoire (préfixe 709), en E.164 et en saisie « humaine ». */
export function randomTestPhone(): { phone: string; phoneInput: string } {
  const national = `709${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
  return { phone: `+221${national}`, phoneInput: `${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7)}` };
}

async function createUser(fullName: string): Promise<E2eUser> {
  const national = `709${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
  const phone = `+221${national}`;
  const password = randomBytes(12).toString("base64url");
  const { data, error } = await admin().auth.admin.createUser({
    email: loginEmailFromPhone(phone),
    password,
    email_confirm: true,
    user_metadata: { e2e: true },
  });
  if (error) throw error;
  const phoneInput = `${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7)}`;
  return { id: data.user.id, phone, phoneInput, password, fullName };
}

function checkOk(result: { error: unknown }): void {
  if (result.error) throw result.error;
}

export async function createFixture(): Promise<E2eFixture> {
  const db = admin();
  const owner = await createUser("Fatou Diallo");
  const disabledManager = await createUser("Moussa Ba");
  const [tenant] = check(await db.from("tenants").insert({ name: `${E2E_TENANT_PREFIX}Fatou Diallo` }).select("id"));
  const tenantId = tenant!.id;
  const shops = check(
    await db
      .from("shops")
      .insert([
        { tenant_id: tenantId, name: "Boutique Keur Fatou", district: "Médina", city: "Dakar" },
        { tenant_id: tenantId, name: "Boutique Fass", district: "Fass", city: "Dakar" },
      ])
      .select("id"),
  );
  checkOk(
    await db.from("profiles").insert([
      { user_id: owner.id, tenant_id: tenantId, role: "owner", full_name: owner.fullName, status: "active", must_change_password: false },
      { user_id: disabledManager.id, tenant_id: tenantId, role: "manager", full_name: disabledManager.fullName, status: "disabled", must_change_password: false },
    ]),
  );
  checkOk(
    await db.from("profile_contacts").insert([
      { user_id: owner.id, tenant_id: tenantId, phone_e164: owner.phone },
      { user_id: disabledManager.id, tenant_id: tenantId, phone_e164: disabledManager.phone },
    ]),
  );
  checkOk(await db.from("shop_members").insert({ shop_id: shops[0]!.id, user_id: disabledManager.id, tenant_id: tenantId }));

  const manager = await createUser("Ousmane Sarr");
  checkOk(
    await db
      .from("profiles")
      .insert({ user_id: manager.id, tenant_id: tenantId, role: "manager", full_name: manager.fullName, status: "active", must_change_password: false }),
  );
  checkOk(await db.from("profile_contacts").insert({ user_id: manager.id, tenant_id: tenantId, phone_e164: manager.phone }));
  checkOk(await db.from("shop_members").insert({ shop_id: shops[0]!.id, user_id: manager.id, tenant_id: tenantId }));

  const platformAdmin = await createUser("Admin Bitig");
  checkOk(await db.from("platform_admins").insert({ user_id: platformAdmin.id, full_name: platformAdmin.fullName, phone_e164: platformAdmin.phone }));

  const fixture = { tenantId, shopIds: shops.map((s) => s.id), owner, disabledManager, manager, platformAdmin };
  mkdirSync("test-results", { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture));
  return fixture;
}

export function readFixture(): E2eFixture {
  return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as E2eFixture;
}

/**
 * Supprime toutes les données créées par les tests e2e (propriétaires préfixés « [e2e] »).
 * Le journal client est immuable : seule la purge private.purge_tenant (rôle postgres, connexion
 * directe à la base) peut le supprimer.
 */
export async function cleanupFixtures(): Promise<void> {
  const db = admin();
  const pgClient = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  try {
    const { rows } = await pgClient.query<{ user_id: string }>(
      "select private.purge_tenant(t.id) as user_id from public.tenants t where t.name like $1",
      [`${E2E_TENANT_PREFIX}%`],
    );
    for (const { user_id } of rows) {
      const { error } = await db.auth.admin.deleteUser(user_id);
      if (error) throw error;
    }
  } finally {
    await pgClient.end();
  }
  // Comptes Auth de test restés sans profil (exécution interrompue).
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const e2eUsers = data.users.filter((u) => u.user_metadata?.e2e === true);
  const ids = e2eUsers.map((u) => u.id);
  if (ids.length) {
    checkOk(await db.from("account_events").delete().in("actor_id", ids));
    checkOk(await db.from("account_events").delete().in("target_user_id", ids));
    checkOk(await db.from("platform_admins").delete().in("user_id", ids));
  }
  for (const user of e2eUsers) {
    const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
  if (existsSync(FIXTURE_FILE)) rmSync(FIXTURE_FILE);
}
