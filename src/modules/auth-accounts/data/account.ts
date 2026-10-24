import "server-only";

import { cache } from "react";
import { getServerSupabase } from "@/shared/supabase/server";
import { redirect } from "next/navigation";
import { decideAccess, type AccessDecision, type AppRole } from "../domain/access";
import { can, type Capability } from "../domain/permissions";

export interface ShopSummary {
  id: string;
  name: string;
  district: string | null;
  city: string | null;
  phone_e164: string | null;
  timezone: string;
  currency: string;
}

export interface CurrentAccount {
  userId: string;
  /** Identifiant Auth interne (dérivé du téléphone), utile pour revérifier le mot de passe. */
  loginEmail: string;
  fullName: string;
  access: AccessDecision;
  role: AppRole | "platformAdmin" | null;
  tenantId: string | null;
  tenantName: string | null;
  mustChangePassword: boolean;
  shops: ShopSummary[];
}

/**
 * Compte connecté, lu AVEC LA RLS (client au nom de l'utilisateur). Mis en cache le temps d'une requête.
 * Renvoie null si personne n'est connecté.
 */
export const getCurrentAccount = cache(async (): Promise<CurrentAccount | null> => {
  const supabase = await getServerSupabase();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return null;

  const [adminResult, profileResult, shopsResult] = await Promise.all([
    supabase.from("platform_admins").select("full_name").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("role, full_name, status, must_change_password, tenant_id").eq("user_id", userId).maybeSingle(),
    supabase.from("shops").select("id, name, district, city, phone_e164, timezone, currency").is("archived_at", null).order("name"),
  ]);
  for (const result of [adminResult, profileResult, shopsResult]) {
    if (result.error) throw new Error(`Lecture du compte impossible : ${result.error.message}`);
  }

  const admin = adminResult.data;
  const profile = profileResult.data;
  const shops = shopsResult.data ?? [];

  // Le propriétaire n'est lisible que si le profil est actif et le propriétaire non suspendu :
  // une ligne absente signifie donc « suspendu » pour un profil actif.
  let tenantName: string | null = null;
  let tenantStatus: "active" | "suspended" = "suspended";
  if (profile) {
    const { data: tenant } = await supabase.from("tenants").select("name, status").eq("id", profile.tenant_id).maybeSingle();
    tenantName = tenant?.name ?? null;
    tenantStatus = tenant?.status ?? "suspended";
  }

  const access = decideAccess({
    isPlatformAdmin: !!admin,
    profile: profile ? { role: profile.role, status: profile.status, tenantStatus, shopCount: shops.length } : null,
  });

  return {
    userId,
    loginEmail: (claimsData?.claims?.email as string | undefined) ?? "",
    fullName: admin?.full_name ?? profile?.full_name ?? "",
    access,
    role: admin ? "platformAdmin" : (profile?.role ?? null),
    tenantId: profile?.tenant_id ?? null,
    tenantName,
    mustChangePassword: profile?.must_change_password ?? false,
    shops: admin ? [] : shops,
  };
});

/** Pour une page : compte autorisé à entrer, sinon redirection (connexion ou refus). */
export async function requirePageAccount(capability?: Capability): Promise<CurrentAccount & { access: { allowed: true } }> {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!account.access.allowed) redirect(`/auth/denied?reason=${account.access.reason}`);
  if (capability && !can(account.role, capability)) redirect("/");
  return account as CurrentAccount & { access: { allowed: true } };
}

/** Pour une Server Action : compte autorisé ayant la capacité demandée, sinon null. */
export async function authorizeAction(capability?: Capability): Promise<CurrentAccount | null> {
  const account = await getCurrentAccount();
  if (!account || !account.access.allowed) return null;
  if (capability && !can(account.role, capability)) return null;
  return account;
}
