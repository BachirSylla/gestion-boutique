"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/shared/supabase/server";

/** Déconnexion : efface la session (cookies) puis renvoie à la page de connexion. */
export async function signOutAction(): Promise<never> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
