import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_URL, assertPublicEnv } from "./env";

/**
 * Client ADMIN (clé secrète, contourne la RLS). Invariant 6 : serveur uniquement.
 * À n'utiliser qu'APRÈS avoir vérifié le rôle de l'appelant.
 */
export function getAdminSupabase(): SupabaseClient<Database> {
  assertPublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquante (serveur uniquement)");
  return createClient<Database>(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
