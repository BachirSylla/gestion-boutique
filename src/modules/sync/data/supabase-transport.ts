// Transport Supabase : envoie la file aux fonctions idempotentes du jalon 3 et télécharge par curseurs.
// Client navigateur (clé publishable + session de l'utilisateur) : la RLS s'applique.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import type { OutboxEntry, RpcErrorLike } from "../domain/sync";
import type { PullCursors, PullResult, SyncTransport } from "./engine";
import type { LocalLine, LocalOperation, LocalProduct, LocalRequest, LocalShop } from "./local-db";

const PAGE = 1000;

export class SupabaseTransport implements SyncTransport {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async send(entry: OutboxEntry): Promise<RpcErrorLike | null> {
    const c = entry.command;
    const at = entry.deviceCreatedAt;
    let result: { error: { code?: string; message?: string } | null; status?: number };
    switch (c.type) {
      case "customer.create": {
        const x = c.customer;
        result = await this.supabase.from("customers").upsert(
          {
            id: x.id,
            shop_id: x.shopId,
            full_name: x.fullName,
            phone_e164: x.phone,
            type: x.type,
            credit_limit: x.creditLimit,
            alert_threshold: x.alertThreshold,
            monthly_due_day: x.monthlyDueDay,
            note: x.note,
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
        break;
      }
      case "take":
        result = await this.supabase.rpc("record_take", {
          p_id: entry.id,
          p_customer_id: c.customerId,
          p_mode: c.mode,
          p_amount: c.amount,
          p_note: c.note ?? "",
          p_lines: c.lines as never,
          p_device_created_at: at,
        });
        break;
      case "payment":
        result = await this.supabase.rpc("record_payment", {
          p_id: entry.id,
          p_customer_id: c.customerId,
          p_amount: c.amount,
          p_payment_method_id: c.paymentMethodId,
          p_note: c.note ?? "",
          p_device_created_at: at,
        });
        break;
      case "cancel":
        result = await this.supabase.rpc("cancel_operation", { p_id: entry.id, p_operation_id: c.operationId, p_reason: c.reason ?? "", p_device_created_at: at });
        break;
      case "request":
        result = await this.supabase.rpc("request_cancellation", { p_id: entry.id, p_operation_id: c.operationId, p_reason: c.reason, p_device_created_at: at });
        break;
    }
    if (!result.error) return null;
    return { code: result.error.code, message: result.error.message, status: result.status };
  }

  async pullShop(shopId: string, from: PullCursors): Promise<PullResult> {
    const sb = this.supabase;

    let customersQuery = sb.from("customers").select("*").eq("shop_id", shopId);
    if (from.customers) customersQuery = customersQuery.gte("updated_at", from.customers);
    let requestsQuery = sb.from("cancellation_requests").select("*").eq("shop_id", shopId);
    if (from.requests) requestsQuery = requestsQuery.or(`created_at.gte.${from.requests},decided_at.gte.${from.requests}`);

    const [customers, operations, requests, settings, methods, profiles, products, prices] = await Promise.all([
      customersQuery,
      this.pageOperations(shopId, from.operations),
      requestsQuery,
      sb.from("shop_settings").select("*").eq("shop_id", shopId).maybeSingle(),
      sb.from("payment_methods").select("id, kind, label, active").eq("shop_id", shopId).order("position").order("created_at"),
      sb.from("profiles").select("user_id, full_name"),
      sb.from("products").select("*").eq("shop_id", shopId),
      sb.from("product_prices").select("*").eq("shop_id", shopId),
    ]);
    for (const r of [customers, requests, settings, methods, profiles, products, prices]) {
      if (r.error) throw new Error(r.error.message);
    }

    const detailedIds = operations.filter((o) => o.takeMode === "detailed").map((o) => o.id);
    const lines: LocalLine[] = [];
    for (let i = 0; i < detailedIds.length; i += 200) {
      const { data, error } = await sb
        .from("take_lines")
        .select("*")
        .in("operation_id", detailedIds.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const l of data ?? []) {
        lines.push({ id: l.id, operationId: l.operation_id, position: l.position, label: l.label, quantityMilli: l.quantity_milli, unit: l.unit, unitPrice: l.unit_price, lineAmount: l.line_amount });
      }
    }

    const requestRows: LocalRequest[] = (requests.data ?? []).map((r) => ({
      id: r.id,
      shopId: r.shop_id,
      operationId: r.operation_id,
      status: r.status as LocalRequest["status"],
      reason: r.reason,
      requestedBy: r.requested_by,
      decisionNote: r.decision_note,
    }));

    return {
      customers: (customers.data ?? []).map((c) => ({
        id: c.id,
        shopId: c.shop_id,
        fullName: c.full_name,
        phone: c.phone_e164,
        type: c.type as "advance" | "monthly" | "free",
        creditLimit: c.credit_limit,
        alertThreshold: c.alert_threshold,
        monthlyDueDay: c.monthly_due_day,
        note: c.note,
        archived: !!c.archived_at,
        updatedAt: c.updated_at,
        localOnly: false,
      })),
      operations,
      lines,
      requests: requestRows,
      shop: settings.data
        ? {
            shopId,
            settings: {
              cancelWindowMinutes: settings.data.cancel_window_minutes,
              roundingStep: settings.data.rounding_step as 1 | 5 | 25,
              advanceAlertThreshold: settings.data.advance_alert_threshold,
              freeCreditReminderDays: settings.data.free_credit_reminder_days,
              monthlyDueDay: settings.data.monthly_due_day,
            },
            paymentMethods: (methods.data ?? []).map((m) => ({ id: m.id, kind: m.kind as LocalShop["paymentMethods"][number]["kind"], label: m.label, active: m.active })),
          }
        : null,
      profiles: (profiles.data ?? []).map((p) => ({ userId: p.user_id, fullName: p.full_name })),
      products: (products.data ?? []).map((p) => {
        const price = (prices.data ?? []).find((x) => x.product_id === p.id);
        type RawFormat = { id?: string; label: string; quantity_milli: number; price: number };
        return {
          id: p.id,
          shopId: p.shop_id,
          name: p.name,
          category: p.category,
          packageLabel: p.package_label,
          saleUnit: p.sale_unit as LocalProduct["saleUnit"],
          capacityMilli: p.capacity_milli,
          reorderThreshold: p.reorder_threshold,
          archived: !!p.archived_at,
          retailPrice: price?.retail_price ?? null,
          packagePrice: price?.package_price ?? null,
          formats: ((price?.formats as RawFormat[] | null) ?? []).map((f) => ({ id: f.id, label: f.label, quantityMilli: Number(f.quantity_milli), price: Number(f.price) })),
          pendingRetailPrice: price?.pending_retail_price ?? null,
        };
      }),
      seen: {
        customers: (customers.data ?? []).map((c) => c.updated_at),
        operations: operations.map((o) => o.serverCreatedAt),
        requests: (requests.data ?? []).flatMap((r) => [r.created_at, r.decided_at ?? ""]).filter(Boolean),
      },
    };
  }

  /** Journal par pages de 1 000 (limite de l'API), dans l'ordre de réception par le serveur. */
  private async pageOperations(shopId: string, from: string | null): Promise<LocalOperation[]> {
    const all: LocalOperation[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let query = this.supabase.from("customer_operations").select("*").eq("shop_id", shopId);
      if (from) query = query.gte("server_created_at", from);
      const { data, error } = await query.order("server_created_at").order("id").range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const o of data ?? []) {
        all.push({
          id: o.id,
          shopId: o.shop_id,
          customerId: o.customer_id,
          kind: o.kind as LocalOperation["kind"],
          amount: o.amount,
          cancelsOperationId: o.cancels_operation_id,
          authorId: o.author_id,
          deviceCreatedAt: o.device_created_at,
          serverCreatedAt: o.server_created_at,
          takeMode: o.take_mode as LocalOperation["takeMode"],
          note: o.note,
          paymentMethodId: o.payment_method_id,
          cancellationReason: o.cancellation_reason,
        });
      }
      if (!data || data.length < PAGE) return all;
    }
  }
}
