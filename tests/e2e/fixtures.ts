// Comptes de test éphémères pour les parcours de bout en bout, sur le projet distant.
// Créés par global-setup, supprimés par global-teardown (et au démarrage s'il en reste).
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loginEmailFromPhone } from "../../src/shared/domain/phone";
import { requireEnv } from "../../scripts/lib/env";

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

  const fixture = { tenantId, shopIds: shops.map((s) => s.id), owner, disabledManager };
  mkdirSync("test-results", { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture));
  return fixture;
}

export function readFixture(): E2eFixture {
  return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as E2eFixture;
}

/** Supprime toutes les données créées par les tests e2e (propriétaires préfixés « [e2e] »). */
export async function cleanupFixtures(): Promise<void> {
  const db = admin();
  const tenants = check(await db.from("tenants").select("id").like("name", `${E2E_TENANT_PREFIX}%`));
  for (const { id: tenantId } of tenants) {
    const profiles = check(await db.from("profiles").select("user_id").eq("tenant_id", tenantId));
    checkOk(await db.from("shop_members").delete().eq("tenant_id", tenantId));
    checkOk(await db.from("profile_contacts").delete().eq("tenant_id", tenantId));
    checkOk(await db.from("profiles").delete().eq("tenant_id", tenantId));
    checkOk(await db.from("shops").delete().eq("tenant_id", tenantId));
    checkOk(await db.from("tenants").delete().eq("id", tenantId));
    for (const { user_id } of profiles) {
      const { error } = await db.auth.admin.deleteUser(user_id);
      if (error) throw error;
    }
  }
  // Comptes Auth de test restés sans profil (exécution interrompue).
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const user of data.users.filter((u) => u.user_metadata?.e2e === true)) {
    const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
  if (existsSync(FIXTURE_FILE)) rmSync(FIXTURE_FILE);
}
