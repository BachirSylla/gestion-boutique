"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertPublicEnv } from "./env";

let client: SupabaseClient<Database> | null = null;

/** Client navigateur (clé publishable, session dans les cookies, persistée pour le hors ligne). */
export function getBrowserSupabase(): SupabaseClient<Database> {
  if (!client) {
    assertPublicEnv();
    client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}
