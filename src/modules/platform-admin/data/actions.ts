"use server";

import { revalidatePath } from "next/cache";
import type { IssuedCredentials } from "@/modules/auth-accounts";
import { authorizeAction, createLoginAccount, deleteLoginAccount, newTemporaryPassword, setLoginPassword } from "@/modules/auth-accounts/server";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { optionalText, phone, text, uuid } from "@/shared/server/form";
import { getAdminSupabase } from "@/shared/supabase/admin";
import { getServerSupabase } from "@/shared/supabase/server";

// Actions de l'administrateur de la plateforme. Chaque action vérifie le rôle de l'appelant,
// puis la fonction SQL appelée le revérifie (p_actor).

export async function createTenantAction(
  _previous: ActionState<{ tenantId: string; credentials: IssuedCredentials }>,
  form: FormData,
): Promise<ActionState<{ tenantId: string; credentials: IssuedCredentials }>> {
  const account = await authorizeAction("managePlatform");
  if (!account) return failure("forbidden");

  const ownerName = text(form, "ownerName");
  const ownerPhone = phone(form, "ownerPhone");
  const fields = { ...(ownerName ? {} : { ownerName: "nameRequired" as const }), ...(ownerPhone ? {} : { ownerPhone: "invalidPhone" as const }) };
  if (!ownerName || !ownerPhone) return failure("invalidInput", fields);

  const temporaryPassword = newTemporaryPassword();
  const login = await createLoginAccount(ownerPhone, temporaryPassword);
  if (!login.ok) return failure(login.error, login.error === "phoneTaken" ? { ownerPhone: "phoneTaken" } : undefined);

  const { data: tenantId, error } = await getAdminSupabase().rpc("srv_create_tenant", {
    p_actor: account.userId,
    p_tenant_name: optionalText(form, "tenantName") ?? ownerName,
    p_owner_id: login.userId,
    p_owner_name: ownerName,
    p_owner_phone: ownerPhone,
    p_shop_name: optionalText(form, "shopName") ?? undefined,
    p_shop_district: optionalText(form, "shopDistrict") ?? undefined,
    p_shop_city: optionalText(form, "shopCity") ?? undefined,
  });
  if (error || !tenantId) {
    await deleteLoginAccount(login.userId);
    return failure(error ? errorFromDatabase(error) : "unexpected");
  }

  revalidatePath("/admin");
  return success({ tenantId, credentials: { fullName: ownerName, phone: ownerPhone, temporaryPassword } });
}

export async function createShopForTenantAction(_previous: ActionState<{ shopId: string }>, form: FormData): Promise<ActionState<{ shopId: string }>> {
  const account = await authorizeAction("managePlatform");
  if (!account) return failure("forbidden");
  const tenantId = uuid(form, "tenantId");
  const name = text(form, "name");
  if (!tenantId) return failure("notFound");
  if (!name) return failure("invalidInput", { name: "nameRequired" });

  const { data: shopId, error } = await getAdminSupabase().rpc("srv_create_shop", {
    p_actor: account.userId,
    p_tenant_id: tenantId,
    p_name: name,
    p_district: optionalText(form, "district") ?? undefined,
    p_city: optionalText(form, "city") ?? undefined,
  });
  if (error || !shopId) return failure(error ? errorFromDatabase(error) : "unexpected");
  revalidatePath(`/admin/${tenantId}`);
  return success({ shopId });
}

export async function setTenantStatusAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("managePlatform");
  if (!account) return failure("forbidden");
  const tenantId = uuid(form, "tenantId");
  const status = text(form, "status");
  if (!tenantId || (status !== "active" && status !== "suspended")) return failure("invalidInput");

  const { error } = await getAdminSupabase().rpc("srv_set_tenant_status", { p_actor: account.userId, p_tenant_id: tenantId, p_status: status });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath("/admin");
  revalidatePath(`/admin/${tenantId}`);
  return success(null);
}

export async function resetOwnerPasswordAction(
  _previous: ActionState<{ credentials: IssuedCredentials }>,
  form: FormData,
): Promise<ActionState<{ credentials: IssuedCredentials }>> {
  const account = await authorizeAction("managePlatform");
  if (!account) return failure("forbidden");
  const userId = uuid(form, "userId");
  if (!userId) return failure("notFound");

  const admin = getAdminSupabase();
  const check = await admin.rpc("srv_check_password_reset", { p_actor: account.userId, p_user_id: userId });
  if (check.error) return failure(errorFromDatabase(check.error));

  // Nom et téléphone lus avec les droits de l'admin (RLS) : il ne voit que les propriétaires.
  const supabase = await getServerSupabase();
  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    supabase.from("profile_contacts").select("phone_e164").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile || !contact) return failure("notFound");

  const temporaryPassword = newTemporaryPassword();
  if (!(await setLoginPassword(userId, temporaryPassword))) return failure("unexpected");
  const recorded = await admin.rpc("srv_record_password_reset", { p_actor: account.userId, p_user_id: userId });
  if (recorded.error) return failure(errorFromDatabase(recorded.error));

  revalidatePath("/admin");
  return success({ credentials: { fullName: profile.full_name, phone: contact.phone_e164, temporaryPassword } });
}
