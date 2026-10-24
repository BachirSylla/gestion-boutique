import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertPublicEnv } from "./env";

/**
 * Client serveur agissant AU NOM de l'utilisateur connecté (clé publishable + cookies de session).
 * Soumis à la RLS comme le navigateur.
 */
export async function getServerSupabase(): Promise<SupabaseClient<Database>> {
  assertPublicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Appel depuis un composant serveur : les cookies sont rafraîchis par le proxy.
        }
      },
    },
  });
}
