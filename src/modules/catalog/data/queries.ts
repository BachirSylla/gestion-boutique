import "server-only";

import { getServerSupabase } from "@/shared/supabase/server";
import type { PriceFormat, PriceGrid, ProductUnit } from "../domain/catalog";

export interface ProductRow {
  id: string;
  shopId: string;
  name: string;
  category: string | null;
  packageLabel: string;
  saleUnit: ProductUnit;
  capacityMilli: number;
  reorderThreshold: number;
  archived: boolean;
  active: PriceGrid | null;
  pending: (PriceGrid & { since: string }) | null;
}

export interface PriceVersionRow extends PriceGrid {
  id: string;
  mode: "initial" | "immediate" | "after_sellout";
  status: "active" | "pending" | "superseded" | "cancelled";
  createdAt: string;
  createdBy: string | null;
  activatedAt: string | null;
}

type RawFormat = { id?: string; label: string; quantity_milli: number; price: number };

export function toFormats(raw: unknown): PriceFormat[] {
  return ((raw as RawFormat[] | null) ?? []).map((f) => ({ id: f.id, label: f.label, quantityMilli: Number(f.quantity_milli), price: Number(f.price) }));
}

/** Produits d'une boutique avec leurs grilles active et en attente (RLS de l'utilisateur). */
export async function listProducts(shopId: string, options: { includeArchived?: boolean } = {}): Promise<ProductRow[]> {
  const supabase = await getServerSupabase();
  let query = supabase.from("products").select("*").eq("shop_id", shopId).order("name");
  if (!options.includeArchived) query = query.is("archived_at", null);
  const [products, prices] = await Promise.all([query, supabase.from("product_prices").select("*").eq("shop_id", shopId)]);
  if (products.error) throw new Error(products.error.message);
  if (prices.error) throw new Error(prices.error.message);
  const byProduct = new Map((prices.data ?? []).map((p) => [p.product_id, p]));
  return (products.data ?? []).map((p) => {
    const price = byProduct.get(p.id);
    return {
      id: p.id,
      shopId: p.shop_id,
      name: p.name,
      category: p.category,
      packageLabel: p.package_label,
      saleUnit: p.sale_unit as ProductUnit,
      capacityMilli: p.capacity_milli,
      reorderThreshold: p.reorder_threshold,
      archived: !!p.archived_at,
      active: price?.retail_price ? { retailPrice: price.retail_price, packagePrice: price.package_price, formats: toFormats(price.formats) } : null,
      pending: price?.pending_retail_price
        ? { retailPrice: price.pending_retail_price, packagePrice: price.pending_package_price, formats: toFormats(price.pending_formats), since: price.pending_since! }
        : null,
    };
  });
}

/** Un conditionnement de ce produit est-il entamé ? (un changement immédiat demande alors d'estimer son reste) */
export async function hasOpenedPackage(productId: string): Promise<boolean> {
  const supabase = await getServerSupabase();
  const { count } = await supabase.from("packages").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("state", "opened");
  return (count ?? 0) > 0;
}

export async function getProduct(productId: string): Promise<{ product: ProductRow; history: PriceVersionRow[] } | null> {
  const supabase = await getServerSupabase();
  const { data: row } = await supabase.from("products").select("shop_id").eq("id", productId).maybeSingle();
  if (!row) return null;
  const [products, history] = await Promise.all([
    listProducts(row.shop_id, { includeArchived: true }),
    supabase.from("price_versions").select("*").eq("product_id", productId).order("created_at", { ascending: false }),
  ]);
  const product = products.find((p) => p.id === productId);
  if (!product) return null;
  return {
    product,
    history: (history.data ?? []).map((v) => ({
      id: v.id,
      retailPrice: v.retail_price,
      packagePrice: v.package_price,
      formats: toFormats(v.formats),
      mode: v.mode as PriceVersionRow["mode"],
      status: v.status as PriceVersionRow["status"],
      createdAt: v.created_at,
      createdBy: v.created_by,
      activatedAt: v.activated_at,
    })),
  };
}
