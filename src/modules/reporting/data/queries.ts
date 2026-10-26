import "server-only";
import type { ClosingRecord, FlowOperation } from "@/modules/cash";
import { getServerSupabase } from "@/shared/supabase/server";
import { grossProfit, periodCash, type GrossProfit, type Period, type PeriodCash, type ReviewForProfit, type WholeSaleForProfit } from "../domain/reporting";

const PAGE = 1000;

export interface ProfitReport {
  period: Period;
  profit: GrossProfit;
  cash: PeriodCash;
  productNames: Record<string, string>;
}

/** Bornes UTC larges (±1 jour) : le filtre exact se fait au jour de la boutique, dans le domaine. */
function widen(period: Period): { start: string; end: string } {
  const shift = (date: string, days: number) => {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString();
  };
  return { start: shift(period.from, -1), end: shift(period.to, 2) };
}

async function paged<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await fetchPage(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

/**
 * Bénéfice brut et argent encaissé d'une boutique sur une période (RG7, RG8).
 * Lecture avec la session de l'utilisateur : la RLS limite aux boutiques auxquelles il est rattaché.
 */
export async function getProfitReport(shop: { id: string; timezone: string }, period: Period): Promise<ProfitReport> {
  const supabase = await getServerSupabase();
  const { start, end } = widen(period);

  const [reviews, sales, operations, cancellations, closings, products] = await Promise.all([
    paged((a, b) =>
      supabase
        .from("package_reviews")
        .select("product_id, finished_at, expected_revenue, estimated_cash_sales, gross_margin")
        .eq("shop_id", shop.id)
        .gte("finished_at", start)
        .lt("finished_at", end)
        .order("finished_at")
        .range(a, b),
    ),
    paged((a, b) =>
      supabase
        .from("stock_movements")
        .select("id, product_id, lot_id, amount, customer_operation_id, device_created_at")
        .eq("shop_id", shop.id)
        .eq("kind", "whole_sale")
        .gte("device_created_at", start)
        .lt("device_created_at", end)
        .order("id")
        .range(a, b),
    ),
    paged((a, b) =>
      supabase
        .from("customer_operations")
        .select("id, kind, amount, cancels_operation_id, device_created_at, payment_method_id")
        .eq("shop_id", shop.id)
        .in("kind", ["take", "payment"])
        .gte("device_created_at", start)
        .lt("device_created_at", end)
        .order("id")
        .range(a, b),
    ),
    // Une annulation est toujours reçue après l'opération annulée.
    paged((a, b) =>
      supabase
        .from("customer_operations")
        .select("id, kind, amount, cancels_operation_id, device_created_at, payment_method_id")
        .eq("shop_id", shop.id)
        .eq("kind", "cancellation")
        .gte("server_created_at", start)
        .order("id")
        .range(a, b),
    ),
    paged((a, b) =>
      supabase
        .from("day_closings")
        .select("id, business_date, total_received, note, author_id, device_created_at, server_created_at")
        .eq("shop_id", shop.id)
        .gte("business_date", period.from)
        .lte("business_date", period.to)
        .order("id")
        .range(a, b),
    ),
    supabase.from("products").select("id, name").eq("shop_id", shop.id),
  ]);
  if (products.error) throw new Error(products.error.message);

  const saleIds = sales.map((s) => s.id);
  const lotIds = [...new Set(sales.map((s) => s.lot_id).filter((id): id is string => !!id))];
  const cancelledSales = new Set<string>();
  const lotCost = new Map<string, number>();
  for (let i = 0; i < Math.max(saleIds.length, lotIds.length); i += 200) {
    const [cancelled, lots] = await Promise.all([
      saleIds.length > i
        ? supabase.from("stock_movements").select("cancels_movement_id").eq("kind", "cancellation").in("cancels_movement_id", saleIds.slice(i, i + 200))
        : Promise.resolve({ data: [], error: null }),
      lotIds.length > i ? supabase.from("lots").select("id, purchase_price").in("id", lotIds.slice(i, i + 200)) : Promise.resolve({ data: [], error: null }),
    ]);
    if (cancelled.error) throw new Error(cancelled.error.message);
    if (lots.error) throw new Error(lots.error.message);
    for (const c of cancelled.data ?? []) if (c.cancels_movement_id) cancelledSales.add(c.cancels_movement_id);
    for (const l of lots.data ?? []) lotCost.set(l.id, l.purchase_price);
  }

  const reviewRows: ReviewForProfit[] = reviews.flatMap((r) =>
    r.product_id
      ? [
          {
            productId: r.product_id,
            finishedAt: r.finished_at,
            expectedRevenue: Number(r.expected_revenue ?? 0),
            estimatedCashSales: Number(r.estimated_cash_sales ?? 0),
            grossMargin: Number(r.gross_margin ?? 0),
          },
        ]
      : [],
  );
  const wholeSales: WholeSaleForProfit[] = sales.map((s) => ({
    id: s.id,
    productId: s.product_id,
    amount: s.amount ?? 0,
    cost: (s.lot_id && lotCost.get(s.lot_id)) || 0,
    customerOperationId: s.customer_operation_id,
    deviceCreatedAt: s.device_created_at,
    cancelled: cancelledSales.has(s.id),
  }));
  const flowOps: FlowOperation[] = [...operations, ...cancellations].map((o) => ({
    id: o.id,
    kind: o.kind as FlowOperation["kind"],
    amount: o.amount,
    cancelsOperationId: o.cancels_operation_id,
    deviceCreatedAt: o.device_created_at,
    paymentMethodId: o.payment_method_id,
  }));
  const closingRows: ClosingRecord[] = closings.map((c) => ({
    id: c.id,
    businessDate: c.business_date,
    totalReceived: c.total_received,
    amounts: [],
    note: c.note,
    authorId: c.author_id,
    deviceCreatedAt: c.device_created_at,
    serverCreatedAt: c.server_created_at,
  }));

  return {
    period,
    profit: grossProfit({ reviews: reviewRows, wholeSales, period, timeZone: shop.timezone }),
    cash: periodCash({ operations: flowOps, wholeSales, closings: closingRows, reviews: reviewRows, period, timeZone: shop.timezone }),
    productNames: Object.fromEntries((products.data ?? []).map((p) => [p.id, p.name])),
  };
}
