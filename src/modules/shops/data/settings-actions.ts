"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/modules/auth-accounts/server";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { text, uuid, uuids } from "@/shared/server/form";
import { getServerSupabase } from "@/shared/supabase/server";

function integer(form: FormData, name: string): number | null {
  const raw = text(form, name, 12).replace(/[\s  ]/g, "");
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Réglages de la boutique (propriétaire). Les bornes sont aussi imposées par la base. */
export async function saveShopSettingsAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageSettings");
  if (!account) return failure("forbidden");
  const shopId = uuid(form, "shopId");
  if (!shopId) return failure("notFound");

  const cancelWindow = integer(form, "cancelWindowMinutes");
  const roundingStep = integer(form, "roundingStep");
  const threshold = integer(form, "advanceAlertThreshold");
  const freeDays = integer(form, "freeCreditReminderDays");
  const dueRaw = text(form, "monthlyDueDay", 4);
  const dueDay = dueRaw ? integer(form, "monthlyDueDay") : null;

  const fields = {
    ...(cancelWindow !== null && cancelWindow <= 60 ? {} : { cancelWindowMinutes: "invalidInput" as const }),
    ...(roundingStep !== null && [1, 5, 25].includes(roundingStep) ? {} : { roundingStep: "invalidInput" as const }),
    ...(threshold !== null ? {} : { advanceAlertThreshold: "invalidAmount" as const }),
    ...(freeDays !== null && freeDays >= 1 && freeDays <= 365 ? {} : { freeCreditReminderDays: "invalidInput" as const }),
    ...(dueRaw === "" || (dueDay !== null && dueDay >= 1 && dueDay <= 28) ? {} : { monthlyDueDay: "invalidDueDay" as const }),
  };
  if (Object.keys(fields).length) return failure("invalidInput", fields);

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("shop_settings")
    .update({
      cancel_window_minutes: cancelWindow!,
      rounding_step: roundingStep!,
      advance_alert_threshold: threshold!,
      free_credit_reminder_days: freeDays!,
      monthly_due_day: dueDay,
    })
    .eq("shop_id", shopId)
    .select("shop_id");
  if (error) return failure(errorFromDatabase(error));
  if (!data?.length) return failure("forbidden");
  revalidatePath("/", "layout");
  return success(null);
}

/** Moyens de paiement actifs (cases cochées) et ajout d'un moyen personnalisé. */
export async function savePaymentMethodsAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageSettings");
  if (!account) return failure("forbidden");
  const shopId = uuid(form, "shopId");
  if (!shopId) return failure("notFound");
  const active = new Set(uuids(form, "activeMethodIds"));
  const all = uuids(form, "methodIds");
  const supabase = await getServerSupabase();

  for (const id of all) {
    const { error } = await supabase.from("payment_methods").update({ active: active.has(id) }).eq("id", id).eq("shop_id", shopId);
    if (error) return failure(errorFromDatabase(error));
  }
  const label = text(form, "newMethodLabel", 40);
  if (label) {
    const { error } = await supabase.from("payment_methods").insert({ shop_id: shopId, kind: "custom", label, position: 80 });
    if (error) return failure(errorFromDatabase(error));
  }
  revalidatePath("/settings");
  return success(null);
}
