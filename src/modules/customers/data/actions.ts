"use server";

import { redirect } from "next/navigation";
import { authorizeAction } from "@/modules/auth-accounts/server";
import { getCurrentShop } from "@/modules/shops/server";
import { errorFromDatabase, failure, type ActionState } from "@/shared/server/action-state";
import { uuid } from "@/shared/server/form";
import { getServerSupabase } from "@/shared/supabase/server";
import { parseCustomerInput } from "../domain/customers";

const FIELDS = ["fullName", "phone", "type", "creditLimit", "alertThreshold", "monthlyDueDay", "note"] as const;

function readRaw(form: FormData): Record<string, string> {
  return Object.fromEntries(FIELDS.map((name) => [name, String(form.get(name) ?? "")]));
}

/** Création (identifiant généré par l'appareil) ou modification d'une fiche client. Passe par la RLS. */
export async function saveCustomerAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageCustomers");
  if (!account) return failure("forbidden");
  const parsed = parseCustomerInput(readRaw(form));
  if (!parsed.ok) return failure("invalidInput", parsed.fields);
  const value = parsed.value;
  const row = {
    full_name: value.fullName,
    phone_e164: value.phone,
    type: value.type,
    credit_limit: value.creditLimit,
    alert_threshold: value.alertThreshold,
    monthly_due_day: value.monthlyDueDay,
    note: value.note,
  };
  const supabase = await getServerSupabase();
  const existingId = uuid(form, "customerId");

  if (existingId) {
    const { data, error } = await supabase.from("customers").update(row).eq("id", existingId).select("id");
    if (error) return failure(errorFromDatabase(error));
    if (!data?.length) return failure("forbidden");
    redirect(`/customers#/c/${existingId}`);
  }

  const newId = uuid(form, "newCustomerId");
  const shop = await getCurrentShop(account);
  if (!newId || !shop) return failure(shop ? "invalidInput" : "noShop");
  const { error } = await supabase.from("customers").insert({ id: newId, shop_id: shop.id, ...row });
  // Double envoi du même formulaire : la fiche existe déjà, on y va.
  if (error && error.code !== "23505") return failure(errorFromDatabase(error));
  redirect(`/customers#/c/${newId}`);
}

/** Archivage (le client disparaît des listes ; son historique reste) ou désarchivage. */
export async function setCustomerArchivedAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageCustomers");
  if (!account) return failure("forbidden");
  const customerId = uuid(form, "customerId");
  const archived = form.get("archived") === "true";
  if (!customerId) return failure("notFound");
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("customers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", customerId)
    .select("id");
  if (error) return failure(errorFromDatabase(error));
  if (!data?.length) return failure("forbidden");
  redirect(archived ? "/customers" : `/customers#/c/${customerId}`);
}
