import "server-only";

import { getServerSupabase } from "@/shared/supabase/server";
import type { AppRole } from "../domain/access";

export interface TeamMember {
  userId: string;
  fullName: string;
  role: AppRole;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  /** Visible du propriétaire et de l'intéressé seulement (RLS). */
  phone: string | null;
  shopIds: string[];
}

/** Membres du propriétaire courant (lus avec la RLS). */
export async function listTeam(tenantId: string): Promise<TeamMember[]> {
  const supabase = await getServerSupabase();
  const [profiles, contacts, members] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, role, status, must_change_password").eq("tenant_id", tenantId).order("full_name"),
    supabase.from("profile_contacts").select("user_id, phone_e164").eq("tenant_id", tenantId),
    supabase.from("shop_members").select("user_id, shop_id").eq("tenant_id", tenantId).is("revoked_at", null),
  ]);
  for (const result of [profiles, contacts, members]) {
    if (result.error) throw new Error(result.error.message);
  }
  const phoneByUser = new Map((contacts.data ?? []).map((c) => [c.user_id, c.phone_e164]));
  return (profiles.data ?? []).map((p) => ({
    userId: p.user_id,
    fullName: p.full_name,
    role: p.role,
    status: p.status,
    mustChangePassword: p.must_change_password,
    phone: phoneByUser.get(p.user_id) ?? null,
    shopIds: (members.data ?? []).filter((m) => m.user_id === p.user_id).map((m) => m.shop_id),
  }));
}

export async function getTeamMember(tenantId: string, userId: string): Promise<TeamMember | null> {
  return (await listTeam(tenantId)).find((m) => m.userId === userId) ?? null;
}
