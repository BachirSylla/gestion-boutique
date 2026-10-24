import "server-only";

import { lastDueDate, localDate, type Amount } from "@/shared/domain";
import { getServerSupabase } from "@/shared/supabase/server";
import { computeBalance, type LedgerOperation } from "@/modules/ledger";
import { effectiveDueDay, reminderReasons, type CustomerType, type ReminderReason, type ReminderSettings } from "../domain/customers";

// Toutes les lectures passent par le client au nom de l'utilisateur : la RLS décide.

export interface ShopSettings {
  cancelWindowMinutes: number;
  roundingStep: 1 | 5 | 25;
  advanceAlertThreshold: Amount;
  freeCreditReminderDays: number;
  monthlyDueDay: number | null;
}

export interface PaymentMethod {
  id: string;
  kind: "cash" | "wave" | "orange_money" | "other" | "custom";
  label: string | null;
  active: boolean;
}

export interface ShopContext {
  shopId: string;
  timeZone: string;
  settings: ShopSettings;
  paymentMethods: PaymentMethod[];
}

export async function getShopContext(shop: { id: string; timezone: string }): Promise<ShopContext> {
  const supabase = await getServerSupabase();
  const [settings, methods] = await Promise.all([
    supabase.from("shop_settings").select("*").eq("shop_id", shop.id).single(),
    supabase.from("payment_methods").select("id, kind, label, active").eq("shop_id", shop.id).order("position").order("created_at"),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  if (methods.error) throw new Error(methods.error.message);
  return {
    shopId: shop.id,
    timeZone: shop.timezone,
    settings: {
      cancelWindowMinutes: settings.data.cancel_window_minutes,
      roundingStep: settings.data.rounding_step as 1 | 5 | 25,
      advanceAlertThreshold: settings.data.advance_alert_threshold,
      freeCreditReminderDays: settings.data.free_credit_reminder_days,
      monthlyDueDay: settings.data.monthly_due_day,
    },
    paymentMethods: (methods.data ?? []).map((m) => ({ id: m.id, kind: m.kind as PaymentMethod["kind"], label: m.label, active: m.active })),
  };
}

export function reminderSettings(context: ShopContext): ReminderSettings {
  return {
    advanceAlertThreshold: context.settings.advanceAlertThreshold,
    freeCreditReminderDays: context.settings.freeCreditReminderDays,
    monthlyDueDay: context.settings.monthlyDueDay,
    timeZone: context.timeZone,
  };
}

export interface CustomerRow {
  id: string;
  shopId: string;
  fullName: string;
  phone: string | null;
  type: CustomerType;
  creditLimit: Amount | null;
  alertThreshold: Amount | null;
  monthlyDueDay: number | null;
  note: string | null;
  archived: boolean;
  balance: Amount;
  totalTaken: Amount;
  totalPaid: Amount;
  lastPaymentAt: string | null;
  firstTakeAt: string | null;
  lastOperationAt: string | null;
}

export async function listCustomers(shopId: string, options: { includeArchived?: boolean } = {}): Promise<CustomerRow[]> {
  const supabase = await getServerSupabase();
  let query = supabase.from("customers").select("*").eq("shop_id", shopId).order("full_name");
  if (!options.includeArchived) query = query.is("archived_at", null);
  const [customers, balances] = await Promise.all([query, supabase.from("customer_balances").select("*").eq("shop_id", shopId)]);
  if (customers.error) throw new Error(customers.error.message);
  if (balances.error) throw new Error(balances.error.message);
  const byCustomer = new Map((balances.data ?? []).map((b) => [b.customer_id, b]));
  return (customers.data ?? []).map((c) => {
    const b = byCustomer.get(c.id);
    return {
      id: c.id,
      shopId: c.shop_id,
      fullName: c.full_name,
      phone: c.phone_e164,
      type: c.type as CustomerType,
      creditLimit: c.credit_limit,
      alertThreshold: c.alert_threshold,
      monthlyDueDay: c.monthly_due_day,
      note: c.note,
      archived: !!c.archived_at,
      balance: b?.balance ?? 0,
      totalTaken: b?.total_taken ?? 0,
      totalPaid: b?.total_paid ?? 0,
      lastPaymentAt: b?.last_payment_at ?? null,
      firstTakeAt: b?.first_take_at ?? null,
      lastOperationAt: b?.last_operation_at ?? null,
    };
  });
}

export interface TakeLineRow {
  label: string;
  quantityMilli: number;
  unit: string;
  unitPrice: Amount;
  lineAmount: Amount;
}

export interface OperationRow extends LedgerOperation {
  takeMode: "quick" | "detailed" | null;
  note: string | null;
  paymentMethodId: string | null;
  cancellationReason: string | null;
  authorName: string;
  lines: TakeLineRow[];
  cancelledBy: OperationRow | null;
  pendingRequest: { id: string; reason: string; requestedBy: string } | null;
  lastDecision: { status: "approved" | "rejected"; note: string | null } | null;
}

export interface CustomerDetail {
  customer: CustomerRow;
  operations: OperationRow[];
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const supabase = await getServerSupabase();
  const { data: customer } = await supabase.from("customers").select("shop_id").eq("id", customerId).maybeSingle();
  if (!customer) return null;
  const [rows, ops, profiles] = await Promise.all([
    listCustomers(customer.shop_id, { includeArchived: true }),
    supabase.from("customer_operations").select("*").eq("customer_id", customerId).order("device_created_at", { ascending: false }),
    supabase.from("profiles").select("user_id, full_name"),
  ]);
  if (ops.error) throw new Error(ops.error.message);
  const opIds = (ops.data ?? []).map((o) => o.id);
  const [lines, requests] = opIds.length
    ? await Promise.all([
        supabase.from("take_lines").select("*").in("operation_id", opIds).order("position"),
        supabase.from("cancellation_requests").select("*").in("operation_id", opIds).order("created_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  for (const result of [lines, requests]) {
    if (result.error) throw new Error(result.error.message);
  }
  const row = rows.find((r) => r.id === customerId);
  if (!row) return null;
  const names = new Map((profiles.data ?? []).map((p) => [p.user_id, p.full_name]));
  const all: OperationRow[] = (ops.data ?? []).map((o) => ({
    id: o.id,
    kind: o.kind as LedgerOperation["kind"],
    amount: o.amount,
    cancelsOperationId: o.cancels_operation_id,
    authorId: o.author_id,
    deviceCreatedAt: o.device_created_at,
    serverCreatedAt: o.server_created_at,
    takeMode: o.take_mode as OperationRow["takeMode"],
    note: o.note,
    paymentMethodId: o.payment_method_id,
    cancellationReason: o.cancellation_reason,
    authorName: names.get(o.author_id) ?? "",
    lines: (lines.data ?? [])
      .filter((l) => l.operation_id === o.id)
      .map((l) => ({ label: l.label, quantityMilli: l.quantity_milli, unit: l.unit, unitPrice: l.unit_price, lineAmount: l.line_amount })),
    cancelledBy: null,
    pendingRequest: null,
    lastDecision: null,
  }));
  const byId = new Map(all.map((o) => [o.id, o]));
  for (const o of all) {
    if (o.kind === "cancellation" && o.cancelsOperationId) {
      const target = byId.get(o.cancelsOperationId);
      if (target) target.cancelledBy = o;
    }
  }
  for (const r of requests.data ?? []) {
    const target = byId.get(r.operation_id);
    if (!target) continue;
    if (r.status === "pending") target.pendingRequest = { id: r.id, reason: r.reason, requestedBy: names.get(r.requested_by) ?? "" };
    else if (!target.lastDecision) target.lastDecision = { status: r.status as "approved" | "rejected", note: r.decision_note };
  }
  return { customer: row, operations: all };
}

export interface ReminderRow {
  customer: CustomerRow;
  reasons: ReminderReason[];
}

/** Clients à relancer aujourd'hui (relance manuelle par le boutiquier). */
export async function listReminders(context: ShopContext, now = new Date()): Promise<ReminderRow[]> {
  const customers = await listCustomers(context.shopId);
  const settings = reminderSettings(context);
  const today = localDate(now, context.timeZone);

  // Clients mensuels qui doivent : prises (non annulées) jusqu'à leur dernière échéance.
  const monthly = customers.filter((c) => c.type === "monthly" && c.balance < 0);
  const takenUntilDue = new Map<string, Amount>();
  if (monthly.length) {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("customer_operations")
      .select("id, kind, amount, cancels_operation_id, customer_id, author_id, device_created_at, server_created_at")
      .in(
        "customer_id",
        monthly.map((c) => c.id),
      );
    if (error) throw new Error(error.message);
    for (const customer of monthly) {
      const dueDate = lastDueDate(today, effectiveDueDay(customer, settings));
      const ops: LedgerOperation[] = (data ?? [])
        .filter((o) => o.customer_id === customer.id)
        .map((o) => ({
          id: o.id,
          kind: o.kind as LedgerOperation["kind"],
          amount: o.amount,
          cancelsOperationId: o.cancels_operation_id,
          authorId: o.author_id,
          deviceCreatedAt: o.device_created_at,
          serverCreatedAt: o.server_created_at,
        }));
      const cancelled = new Set(ops.filter((o) => o.kind === "cancellation").map((o) => o.cancelsOperationId));
      const untilDue = ops.filter((o) => o.kind === "take" && !cancelled.has(o.id) && localDate(o.deviceCreatedAt, context.timeZone) <= dueDate);
      takenUntilDue.set(customer.id, computeBalance(untilDue).totalTaken);
    }
  }

  return customers
    .map((customer) => ({
      customer,
      reasons: reminderReasons(
        customer,
        {
          balance: customer.balance,
          totalPaid: customer.totalPaid,
          lastPaymentAt: customer.lastPaymentAt,
          firstTakeAt: customer.firstTakeAt,
          takenUntilLastDue: takenUntilDue.get(customer.id),
        },
        settings,
        today,
      ),
    }))
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => a.customer.balance - b.customer.balance);
}

export interface PendingRequestRow {
  id: string;
  reason: string;
  createdAt: string;
  requestedBy: string;
  operation: { id: string; kind: string; amount: Amount | null; deviceCreatedAt: string; authorName: string };
  customer: { id: string; fullName: string };
}

export async function listPendingRequests(shopId: string): Promise<PendingRequestRow[]> {
  const supabase = await getServerSupabase();
  const { data: requests, error } = await supabase
    .from("cancellation_requests")
    .select("id, reason, created_at, requested_by, operation_id")
    .eq("shop_id", shopId)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!requests?.length) return [];
  const [ops, profiles] = await Promise.all([
    supabase
      .from("customer_operations")
      .select("id, kind, amount, device_created_at, author_id, customer_id")
      .in(
        "id",
        requests.map((r) => r.operation_id),
      ),
    supabase.from("profiles").select("user_id, full_name"),
  ]);
  if (ops.error) throw new Error(ops.error.message);
  const customers = await supabase
    .from("customers")
    .select("id, full_name")
    .in(
      "id",
      (ops.data ?? []).map((o) => o.customer_id),
    );
  const names = new Map((profiles.data ?? []).map((p) => [p.user_id, p.full_name]));
  const opById = new Map((ops.data ?? []).map((o) => [o.id, o]));
  const customerById = new Map((customers.data ?? []).map((c) => [c.id, c.full_name]));
  return requests.flatMap((r) => {
    const op = opById.get(r.operation_id);
    if (!op) return [];
    return [
      {
        id: r.id,
        reason: r.reason,
        createdAt: r.created_at,
        requestedBy: names.get(r.requested_by) ?? "",
        operation: { id: op.id, kind: op.kind, amount: op.amount, deviceCreatedAt: op.device_created_at, authorName: names.get(op.author_id) ?? "" },
        customer: { id: op.customer_id, fullName: customerById.get(op.customer_id) ?? "" },
      },
    ];
  });
}

/** Nombre de demandes d'annulation en attente (pastille du propriétaire). */
export async function countPendingRequests(shopId: string): Promise<number> {
  const supabase = await getServerSupabase();
  const { count } = await supabase.from("cancellation_requests").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "pending");
  return count ?? 0;
}
