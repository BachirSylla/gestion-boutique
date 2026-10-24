import "server-only";

import { getServerSupabase } from "@/shared/supabase/server";

export interface AccountEvent {
  id: string;
  type: string;
  actorId: string | null;
  targetUserId: string | null;
  shopId: string | null;
  createdAt: string;
}

/** Dernières actions sur les comptes d'un propriétaire (lues avec la RLS). */
export async function listAccountEvents(tenantId: string, limit = 20): Promise<AccountEvent[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("account_events")
    .select("id, type, actor_id, target_user_id, shop_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id,
    type: e.type,
    actorId: e.actor_id,
    targetUserId: e.target_user_id,
    shopId: e.shop_id,
    createdAt: e.created_at,
  }));
}
