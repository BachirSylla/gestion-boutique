"use server";

import { revalidatePath } from "next/cache";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { phone, text, uuid, uuids } from "@/shared/server/form";
import { getAdminSupabase } from "@/shared/supabase/admin";
import type { IssuedCredentials } from "../domain/credentials-share";
import { MEMBER_ROLES, type MemberRole } from "../domain/permissions";
import { authorizeAction } from "./account";
import { createLoginAccount, deleteLoginAccount, newTemporaryPassword, setLoginBanned, setLoginPassword } from "./auth-admin";
import { getTeamMember } from "./team";

// Actions du propriétaire sur ses employés. Rôle vérifié ici, puis revérifié par les fonctions SQL.

export async function createMemberAction(
  _previous: ActionState<{ userId: string; credentials: IssuedCredentials }>,
  form: FormData,
): Promise<ActionState<{ userId: string; credentials: IssuedCredentials }>> {
  const account = await authorizeAction("manageTeam");
  if (!account) return failure("forbidden");

  const fullName = text(form, "fullName");
  const memberPhone = phone(form, "phone");
  const role = text(form, "role") as MemberRole;
  const shopIds = uuids(form, "shopIds");
  const fields = {
    ...(fullName ? {} : { fullName: "nameRequired" as const }),
    ...(memberPhone ? {} : { phone: "invalidPhone" as const }),
    ...(MEMBER_ROLES.includes(role) ? {} : { role: "roleRequired" as const }),
    ...(shopIds.length ? {} : { shopIds: "shopRequired" as const }),
  };
  if (!fullName || !memberPhone || !MEMBER_ROLES.includes(role) || !shopIds.length) return failure("invalidInput", fields);

  const temporaryPassword = newTemporaryPassword();
  const login = await createLoginAccount(memberPhone, temporaryPassword);
  if (!login.ok) return failure(login.error, login.error === "phoneTaken" ? { phone: "phoneTaken" } : undefined);

  const { error } = await getAdminSupabase().rpc("srv_create_member", {
    p_actor: account.userId,
    p_user_id: login.userId,
    p_role: role,
    p_full_name: fullName,
    p_phone: memberPhone,
    p_shop_ids: shopIds,
  });
  if (error) {
    await deleteLoginAccount(login.userId);
    return failure(errorFromDatabase(error));
  }
  revalidatePath("/team");
  return success({ userId: login.userId, credentials: { fullName, phone: memberPhone, temporaryPassword } });
}

export async function setMemberShopsAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageTeam");
  if (!account) return failure("forbidden");
  const userId = uuid(form, "userId");
  const shopIds = uuids(form, "shopIds");
  if (!userId) return failure("notFound");
  if (!shopIds.length) return failure("invalidInput", { shopIds: "shopRequired" });

  const { error } = await getAdminSupabase().rpc("srv_set_member_shops", { p_actor: account.userId, p_user_id: userId, p_shop_ids: shopIds });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
  return success(null);
}

export async function setMemberStatusAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageTeam");
  if (!account) return failure("forbidden");
  const userId = uuid(form, "userId");
  const status = text(form, "status");
  if (!userId || (status !== "active" && status !== "disabled")) return failure("invalidInput");

  const { error } = await getAdminSupabase().rpc("srv_set_member_status", { p_actor: account.userId, p_user_id: userId, p_status: status });
  if (error) return failure(errorFromDatabase(error));
  // La RLS coupe déjà l'accès ; le bannissement empêche en plus la connexion et le renouvellement de session.
  await setLoginBanned(userId, status === "disabled");
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
  return success(null);
}

export async function resetMemberPasswordAction(
  _previous: ActionState<{ credentials: IssuedCredentials }>,
  form: FormData,
): Promise<ActionState<{ credentials: IssuedCredentials }>> {
  const account = await authorizeAction("manageTeam");
  if (!account?.tenantId) return failure("forbidden");
  const userId = uuid(form, "userId");
  if (!userId) return failure("notFound");

  const admin = getAdminSupabase();
  const check = await admin.rpc("srv_check_password_reset", { p_actor: account.userId, p_user_id: userId });
  if (check.error) return failure(errorFromDatabase(check.error));
  const member = await getTeamMember(account.tenantId, userId);
  if (!member?.phone) return failure("notFound");

  const temporaryPassword = newTemporaryPassword();
  if (!(await setLoginPassword(userId, temporaryPassword))) return failure("unexpected");
  const recorded = await admin.rpc("srv_record_password_reset", { p_actor: account.userId, p_user_id: userId });
  if (recorded.error) return failure(errorFromDatabase(recorded.error));
  revalidatePath(`/team/${userId}`);
  return success({ credentials: { fullName: member.fullName, phone: member.phone, temporaryPassword } });
}
