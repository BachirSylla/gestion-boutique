import "server-only";

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loginEmailFromPhone } from "@/shared/domain";
import { getAdminSupabase } from "@/shared/supabase/admin";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/shared/supabase/env";
import { generateTemporaryPassword } from "../domain/password";

// Opérations Supabase Auth avec la clé secrète. À n'appeler qu'après vérification du rôle de l'appelant.

const BAN_FOREVER = "876000h"; // 100 ans

export function newTemporaryPassword(): string {
  return generateTemporaryPassword((max) => randomInt(max));
}

/** Crée le compte de connexion (identifiant interne dérivé du téléphone). */
export async function createLoginAccount(
  phoneE164: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: "phoneTaken" | "unexpected" }> {
  const { data, error } = await getAdminSupabase().auth.admin.createUser({
    email: loginEmailFromPhone(phoneE164),
    password,
    email_confirm: true,
  });
  if (error) {
    return { ok: false, error: error.code === "email_exists" || error.status === 422 ? "phoneTaken" : "unexpected" };
  }
  return { ok: true, userId: data.user.id };
}

/** Annule la création d'un compte de connexion quand l'écriture en base a échoué. */
export async function deleteLoginAccount(userId: string): Promise<void> {
  await getAdminSupabase().auth.admin.deleteUser(userId);
}

export async function setLoginPassword(userId: string, password: string): Promise<boolean> {
  const { error } = await getAdminSupabase().auth.admin.updateUserById(userId, { password });
  return !error;
}

/** Un compte désactivé ne peut plus se connecter ni renouveler sa session. */
export async function setLoginBanned(userId: string, banned: boolean): Promise<boolean> {
  const { error } = await getAdminSupabase().auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_FOREVER : "none" });
  return !error;
}

/** Vérifie un mot de passe sans toucher à la session courante (client jetable, sans persistance). */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (!error) await client.auth.signOut({ scope: "local" });
  return !error;
}
