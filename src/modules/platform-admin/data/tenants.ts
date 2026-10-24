import "server-only";

import { getServerSupabase } from "@/shared/supabase/server";

export interface TenantOwner {
  userId: string;
  fullName: string;
  phone: string | null;
  status: "active" | "disabled";
  mustChangePassword: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  status: "active" | "suspended";
  createdAt: string;
  owner: TenantOwner | null;
  shops: { id: string; name: string; district: string | null; city: string | null; archived: boolean }[];
}

// Lectures AVEC LA RLS : l'admin plateforme voit les propriétaires, leurs boutiques et le téléphone
// des propriétaires, jamais les employés ni les données clients.

export async function listTenants(): Promise<TenantSummary[]> {
  const supabase = await getServerSupabase();
  const [tenants, owners, contacts, shops] = await Promise.all([
    supabase.from("tenants").select("id, name, status, created_at").order("created_at", { ascending: false }),
    supabase.from("profiles").select("user_id, tenant_id, full_name, status, must_change_password").eq("role", "owner"),
    supabase.from("profile_contacts").select("user_id, phone_e164"),
    supabase.from("shops").select("id, tenant_id, name, district, city, archived_at").order("name"),
  ]);
  for (const result of [tenants, owners, contacts, shops]) {
    if (result.error) throw new Error(result.error.message);
  }
  const phoneByUser = new Map((contacts.data ?? []).map((c) => [c.user_id, c.phone_e164]));
  return (tenants.data ?? []).map((t) => {
    const owner = owners.data?.find((o) => o.tenant_id === t.id);
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      createdAt: t.created_at,
      owner: owner
        ? {
            userId: owner.user_id,
            fullName: owner.full_name,
            phone: phoneByUser.get(owner.user_id) ?? null,
            status: owner.status,
            mustChangePassword: owner.must_change_password,
          }
        : null,
      shops: (shops.data ?? [])
        .filter((s) => s.tenant_id === t.id)
        .map((s) => ({ id: s.id, name: s.name, district: s.district, city: s.city, archived: !!s.archived_at })),
    };
  });
}

export async function getTenant(tenantId: string): Promise<TenantSummary | null> {
  const tenants = await listTenants();
  return tenants.find((t) => t.id === tenantId) ?? null;
}
