// Transport Supabase : envoie la file aux fonctions idempotentes du jalon 3 et télécharge par curseurs.
// Client navigateur (clé publishable + session de l'utilisateur) : la RLS s'applique.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import type { OutboxEntry, RpcErrorLike } from "../domain/sync";
import type { PullCursors, PullResult, SyncTransport } from "./engine";
import type { LocalClosing, LocalLine, LocalMovement, LocalOperation, LocalProduct, LocalRequest, LocalShop } from "./local-db";

const PAGE = 1000;
/** Fenêtre gardée sur l'appareil pour les ventes du jour et les clôtures. */
const RECENT_DAYS = 62;

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
      case "stock.receive":
        result = await this.supabase.rpc("receive_lot", {
          p_id: entry.id,
          p_product_id: c.productId,
          p_count: c.count,
          p_purchase_price: c.purchasePrice,
          p_supplier: c.supplier ?? "",
          p_device_created_at: at,
        });
        break;
      case "stock.open":
        result = await this.supabase.rpc("open_package", { p_id: entry.id, p_product_id: c.productId, p_device_created_at: at });
        break;
      case "stock.finish":
        result = await this.supabase.rpc("finish_package", { p_id: entry.id, p_product_id: c.productId, p_device_created_at: at });
        break;
      case "stock.sell":
        result = await this.supabase.rpc("sell_whole_package", {
          p_id: entry.id,
          p_product_id: c.productId,
          p_price: c.price,
          p_customer_id: c.customerId as string,
          p_take_id: c.takeId as string,
          p_device_created_at: at,
        });
        break;
      case "stock.estimate":
        result = await this.supabase.rpc("estimate_remaining", { p_id: entry.id, p_product_id: c.productId, p_estimate: c.estimate, p_device_created_at: at });
        break;
      case "stock.adjust":
        result = await this.supabase.rpc("adjust_stock", {
          p_id: entry.id,
          p_product_id: c.productId,
          p_delta: c.delta,
          p_reason: c.reason ?? "",
          p_purchase_price: c.purchasePrice as number,
          p_device_created_at: at,
        });
        break;
      case "stock.cancel":
        result = await this.supabase.rpc("cancel_stock_movement", { p_id: entry.id, p_movement_id: c.movementId, p_reason: c.reason ?? "", p_device_created_at: at });
        break;
      case "stock.request":
        result = await this.supabase.rpc("request_stock_cancellation", { p_id: entry.id, p_movement_id: c.movementId, p_reason: c.reason, p_device_created_at: at });
        break;
      case "cash.close":
        result = await this.supabase.rpc("record_day_closing", {
          p_id: entry.id,
          p_shop_id: c.shopId,
          p_business_date: c.businessDate,
          p_amounts: c.amounts.map((a) => ({ payment_method_id: a.paymentMethodId, amount: a.amount })),
          p_note: c.note ?? "",
          p_device_created_at: at,
        });
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

    // Ventes du jour et clôtures : les ventes de sacs entiers et les clôtures des dernières semaines restent sur l'appareil.
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
    const [customers, operations, requests, settings, methods, profiles, products, prices, packages, movements, reviews, wholeSales, closings] = await Promise.all([
      customersQuery,
      this.pageOperations(shopId, from.operations),
      requestsQuery,
      sb.from("shop_settings").select("*").eq("shop_id", shopId).maybeSingle(),
      sb.from("payment_methods").select("id, kind, label, active").eq("shop_id", shopId).order("position").order("created_at"),
      sb.from("profiles").select("user_id, full_name"),
      sb.from("products").select("*").eq("shop_id", shopId),
      sb.from("product_prices").select("*").eq("shop_id", shopId),
      sb.from("packages").select("id, shop_id, product_id, lot_id, state, opened_at, remaining_estimate").eq("shop_id", shopId).in("state", ["closed", "opened"]),
      sb.from("stock_movements").select("*").eq("shop_id", shopId).order("server_created_at", { ascending: false }).limit(150),
      sb.from("package_reviews").select("*").eq("shop_id", shopId).order("finished_at", { ascending: false }).limit(60),
      sb.from("stock_movements").select("*").eq("shop_id", shopId).in("kind", ["whole_sale", "cancellation"]).gte("device_created_at", since).limit(PAGE),
      sb
        .from("day_closings")
        .select("*, day_closing_amounts(payment_method_id, amount)")
        .eq("shop_id", shopId)
        .gte("business_date", since.slice(0, 10))
        .limit(PAGE),
    ]);
    for (const r of [customers, requests, settings, methods, profiles, products, prices, packages, movements, reviews, wholeSales, closings]) {
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
        lines.push({
          id: l.id,
          operationId: l.operation_id,
          position: l.position,
          label: l.label,
          quantityMilli: l.quantity_milli,
          unit: l.unit,
          unitPrice: l.unit_price,
          lineAmount: l.line_amount,
          formatLabel: l.format_label,
          formatCount: l.format_count,
        });
      }
    }

    const requestRows: LocalRequest[] = (requests.data ?? []).map((r) => ({
      id: r.id,
      shopId: r.shop_id,
      operationId: r.operation_id,
      stockMovementId: r.stock_movement_id,
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
      packages: (packages.data ?? []).map((k) => ({
        id: k.id,
        shopId: k.shop_id,
        productId: k.product_id,
        lotId: k.lot_id,
        state: k.state as "closed" | "opened",
        openedAt: k.opened_at,
        remainingEstimate: k.remaining_estimate,
      })),
      movements: [...new Map([...(wholeSales.data ?? []), ...(movements.data ?? [])].map((m) => [m.id, m])).values()].map((m) => ({
        id: m.id,
        shopId: m.shop_id,
        productId: m.product_id,
        kind: m.kind as LocalMovement["kind"],
        quantity: m.quantity,
        amount: m.amount,
        reason: m.reason,
        cancelsMovementId: m.cancels_movement_id,
        customerOperationId: m.customer_operation_id,
        authorId: m.author_id,
        deviceCreatedAt: m.device_created_at,
        serverCreatedAt: m.server_created_at,
      })),
      closings: (closings.data ?? []).map(
        (k): LocalClosing => ({
          id: k.id,
          shopId: k.shop_id,
          businessDate: k.business_date,
          totalReceived: k.total_received,
          amounts: (k.day_closing_amounts ?? []).map((a) => ({ paymentMethodId: a.payment_method_id, amount: a.amount })),
          note: k.note,
          authorId: k.author_id,
          deviceCreatedAt: k.device_created_at,
          serverCreatedAt: k.server_created_at,
        }),
      ),
      reviews: (reviews.data ?? []).flatMap((r) =>
        r.package_id && r.shop_id && r.product_id
          ? [
              {
                packageId: r.package_id,
                shopId: r.shop_id,
                productId: r.product_id,
                openedAt: r.opened_at,
                finishedAt: r.finished_at,
                expectedRevenue: Number(r.expected_revenue ?? 0),
                accountTakes: Number(r.account_takes ?? 0),
                estimatedCashSales: Number(r.estimated_cash_sales ?? 0),
                cost: Number(r.cost ?? 0),
                grossMargin: Number(r.gross_margin ?? 0),
              },
            ]
          : [],
      ),
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
