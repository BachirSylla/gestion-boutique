import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/shared/supabase/server";

const REASONS = new Set(["accountDisabled", "tenantSuspended", "noAccess"]);

/**
 * Gestionnaire de route : déconnecte un compte refusé (désactivé, suspendu, sans boutique)
 * et renvoie à la connexion avec le motif. Un composant serveur ne peut pas effacer les cookies.
 */
export async function denyAccessRoute(request: NextRequest): Promise<NextResponse> {
  const reason = request.nextUrl.searchParams.get("reason") ?? "";
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = REASONS.has(reason) ? `?error=${reason}` : "";
  return NextResponse.redirect(url);
}
