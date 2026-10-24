"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { getAdminSupabase } from "@/shared/supabase/admin";
import { validateNewPassword } from "../domain/password";
import { getCurrentAccount } from "./account";
import { setLoginPassword, verifyPassword } from "./auth-admin";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

async function applyNewPassword(userId: string, password: string): Promise<ActionState> {
  if (!(await setLoginPassword(userId, password))) return failure("unexpected");
  const { error } = await getAdminSupabase().rpc("srv_record_password_change", { p_user_id: userId });
  if (error) return failure(errorFromDatabase(error));
  return success(null);
}

/** Changement de mot de passe depuis « Mon compte » : le mot de passe actuel est revérifié. */
export async function changePasswordAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await getCurrentAccount();
  if (!account?.access.allowed) return failure("forbidden");

  const current = field(form, "currentPassword");
  const password = field(form, "newPassword");
  const invalid = validateNewPassword(password, field(form, "confirmPassword"), { current });
  if (invalid) return failure(invalid, { [invalid === "passwordMismatch" ? "confirmPassword" : "newPassword"]: invalid });
  if (!(await verifyPassword(account.loginEmail, current))) return failure("currentPasswordWrong", { currentPassword: "currentPasswordWrong" });

  const result = await applyNewPassword(account.userId, password);
  if (result.status === "success") revalidatePath("/", "layout");
  return result;
}

/**
 * Premier mot de passe (compte créé ou réinitialisé) : l'utilisateur vient de se connecter avec
 * le mot de passe provisoire, on ne le redemande pas. N'est permis que si le changement est exigé.
 */
export async function firstPasswordAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await getCurrentAccount();
  if (!account?.access.allowed || !account.mustChangePassword) return failure("forbidden");

  const password = field(form, "newPassword");
  const invalid = validateNewPassword(password, field(form, "confirmPassword"));
  if (invalid) return failure(invalid, { [invalid === "passwordMismatch" ? "confirmPassword" : "newPassword"]: invalid });

  const result = await applyNewPassword(account.userId, password);
  if (result.status !== "success") return result;
  revalidatePath("/", "layout");
  redirect("/");
}
