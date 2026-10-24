"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeAction } from "@/modules/auth-accounts/server";
import { parseQuantity } from "@/shared/domain";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { text, uuid } from "@/shared/server/form";
import { getServerSupabase } from "@/shared/supabase/server";
import { SALE_UNITS, type SaleUnit } from "../domain/operations";

// Écritures du journal : identifiant et heure générés par l'appareil (renvoi sans doublon),
// droits et calculs revérifiés par les fonctions SQL (record_take, cancel_operation…).

function deviceTime(form: FormData): string {
  const raw = text(form, "deviceCreatedAt", 40);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function amount(form: FormData, name: string): number | null {
  const compact = text(form, name, 20).replace(/[\s  .]/g, "");
  return /^\d{1,12}$/.test(compact) && Number(compact) > 0 ? Number(compact) : null;
}

interface RawLine {
  label: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

function linesFrom(form: FormData): { label: string; quantity_milli: number; unit: SaleUnit; unit_price: number }[] | null {
  let raw: RawLine[];
  try {
    raw = JSON.parse(text(form, "lines", 20_000) || "[]") as RawLine[];
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const lines = raw.map((line) => ({
    label: String(line.label ?? "").trim().slice(0, 80),
    quantity_milli: parseQuantity(String(line.quantity ?? "")) ?? 0,
    unit: (SALE_UNITS as readonly string[]).includes(line.unit) ? (line.unit as SaleUnit) : "other",
    unit_price: Number(String(line.unitPrice ?? "").replace(/\D/g, "")) || 0,
  }));
  return lines.every((l) => l.label && l.quantity_milli > 0 && l.unit_price > 0) ? lines : null;
}

export async function recordTakeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("recordOperations");
  if (!account) return failure("forbidden");
  const operationId = uuid(form, "operationId");
  const customerId = uuid(form, "customerId");
  if (!operationId || !customerId) return failure("invalidInput");
  const mode = text(form, "mode") === "detailed" ? "detailed" : "quick";

  const quickAmount = mode === "quick" ? amount(form, "amount") : null;
  if (mode === "quick" && !quickAmount) return failure("amountRequired", { amount: "amountRequired" });
  const lines = mode === "detailed" ? linesFrom(form) : null;
  if (mode === "detailed" && !lines) return failure("lineInvalid", { lines: "lineInvalid" });

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("record_take", {
    p_id: operationId,
    p_customer_id: customerId,
    p_mode: mode,
    p_amount: quickAmount as number,
    p_note: text(form, "note", 500),
    p_lines: (lines ?? []) as never,
    p_device_created_at: deviceTime(form),
  });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=${operationId}`);
}

export async function recordPaymentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("recordOperations");
  if (!account) return failure("forbidden");
  const operationId = uuid(form, "operationId");
  const customerId = uuid(form, "customerId");
  const methodId = uuid(form, "paymentMethodId");
  const value = amount(form, "amount");
  if (!operationId || !customerId) return failure("invalidInput");
  const fields = { ...(value ? {} : { amount: "amountRequired" as const }), ...(methodId ? {} : { paymentMethodId: "paymentMethodRequired" as const }) };
  if (!value || !methodId) return failure("invalidInput", fields);

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("record_payment", {
    p_id: operationId,
    p_customer_id: customerId,
    p_amount: value,
    p_payment_method_id: methodId,
    p_note: text(form, "note", 500),
    p_device_created_at: deviceTime(form),
  });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=${operationId}`);
}

/** Annulation directe (propriétaire, ou gérant dans le délai pour sa propre opération). */
export async function cancelOperationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("recordOperations");
  if (!account) return failure("forbidden");
  const cancellationId = uuid(form, "cancellationId");
  const operationId = uuid(form, "operationId");
  const customerId = uuid(form, "customerId");
  if (!cancellationId || !operationId) return failure("invalidInput");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("cancel_operation", {
    p_id: cancellationId,
    p_operation_id: operationId,
    p_reason: text(form, "reason", 500),
    p_device_created_at: deviceTime(form),
  });
  if (error) return failure(errorFromDatabase(error));
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return success(null);
}

/** Demande d'annulation (hors délai ou opération d'un autre) : motif obligatoire. */
export async function requestCancellationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("recordOperations");
  if (!account) return failure("forbidden");
  const requestId = uuid(form, "requestId");
  const operationId = uuid(form, "operationId");
  const customerId = uuid(form, "customerId");
  const reason = text(form, "reason", 500);
  if (!requestId || !operationId) return failure("invalidInput");
  if (reason.length < 3) return failure("reasonRequired", { reason: "reasonRequired" });
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("request_cancellation", {
    p_id: requestId,
    p_operation_id: operationId,
    p_reason: reason,
    p_device_created_at: deviceTime(form),
  });
  if (error) return failure(errorFromDatabase(error));
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/cancellations");
  return success(null);
}

/** Décision du propriétaire sur une demande d'annulation. */
export async function decideCancellationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("decideCancellations");
  if (!account) return failure("forbidden");
  const requestId = uuid(form, "requestId");
  if (!requestId) return failure("invalidInput");
  const approve = form.get("approve") === "true";
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("decide_cancellation", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: text(form, "note", 500),
    p_cancellation_id: crypto.randomUUID(),
  });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath("/", "layout");
  // La demande quitte la liste : la confirmation s'affiche en haut de la page.
  redirect(`/cancellations?decided=${approve ? "approved" : "rejected"}`);
}
