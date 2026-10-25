"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeAction } from "@/modules/auth-accounts/server";
import { getCurrentShop } from "@/modules/shops/server";
import { parseQuantity } from "@/shared/domain";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { text, uuid } from "@/shared/server/form";
import { getServerSupabase } from "@/shared/supabase/server";
import { SALE_UNITS, validateGrid, type PriceFormat, type ProductUnit } from "../domain/catalog";

function amount(form: FormData, name: string): number | null {
  const compact = text(form, name, 20).replace(/[\s  .]/g, "");
  return /^\d{1,12}$/.test(compact) && Number(compact) > 0 ? Number(compact) : null;
}

/** Formats saisis : champs formatLabel / formatQuantity / formatPrice répétés. */
function formatsFrom(form: FormData): PriceFormat[] | null {
  const labels = form.getAll("formatLabel").map(String);
  const quantities = form.getAll("formatQuantity").map(String);
  const prices = form.getAll("formatPrice").map(String);
  const formats: PriceFormat[] = [];
  for (const [i, label] of labels.entries()) {
    if (!label.trim() && !(quantities[i] ?? "").trim() && !(prices[i] ?? "").trim()) continue; // ligne vide ignorée
    const quantityMilli = parseQuantity(quantities[i] ?? "") ?? 0;
    const price = Number((prices[i] ?? "").replace(/\D/g, "")) || 0;
    formats.push({ label: label.trim(), quantityMilli, price });
  }
  return formats.every((f) => f.label && f.quantityMilli > 0 && f.price > 0) ? formats : null;
}

const toRaw = (formats: PriceFormat[]) => formats.map((f) => ({ label: f.label, quantity_milli: f.quantityMilli, price: f.price }));

export async function createProductAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageCatalog");
  const shop = account ? await getCurrentShop(account) : null;
  if (!account || !shop) return failure("forbidden");
  const id = uuid(form, "productId");
  const name = text(form, "name", 80);
  const unit = text(form, "saleUnit") as ProductUnit;
  const capacity = parseQuantity(text(form, "capacity", 12));
  const retail = amount(form, "retailPrice");
  const packageRaw = text(form, "packagePrice");
  const packagePrice = packageRaw ? amount(form, "packagePrice") : null;
  const formats = formatsFrom(form);
  const fields = {
    ...(name ? {} : { name: "nameRequired" as const }),
    ...(SALE_UNITS.includes(unit) ? {} : { saleUnit: "invalidInput" as const }),
    ...(capacity && capacity > 0 ? {} : { capacity: "invalidInput" as const }),
    ...(retail ? {} : { retailPrice: "invalidAmount" as const }),
    ...(packageRaw && !packagePrice ? { packagePrice: "invalidAmount" as const } : {}),
    ...(formats ? {} : { formats: "invalidInput" as const }),
  };
  if (!id || Object.keys(fields).length) return failure("invalidInput", fields);
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("create_product", {
    p_id: id,
    p_shop_id: shop.id,
    p_name: name,
    p_category: text(form, "category", 40),
    p_package_label: text(form, "packageLabel", 30) || "sac",
    p_sale_unit: unit,
    p_capacity_milli: capacity!,
    p_reorder_threshold: Number(text(form, "reorderThreshold", 4)) || 1,
    p_retail_price: retail!,
    p_package_price: packagePrice as number,
    p_formats: toRaw(formats!) as never,
  });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath("/catalog");
  redirect(`/catalog/${id}`);
}

export async function addStarterCatalogAction(): Promise<ActionState> {
  const account = await authorizeAction("manageCatalog");
  const shop = account ? await getCurrentShop(account) : null;
  if (!account || !shop) return failure("forbidden");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("add_starter_catalog", { p_shop_id: shop.id });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath("/catalog");
  return success(null);
}

export async function changePriceAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageCatalog");
  if (!account) return failure("forbidden");
  const productId = uuid(form, "productId");
  const retail = amount(form, "retailPrice");
  const packageRaw = text(form, "packagePrice");
  const packagePrice = packageRaw ? amount(form, "packagePrice") : null;
  const formats = formatsFrom(form);
  const mode = text(form, "mode");
  if (!productId) return failure("notFound");
  const grid = retail && formats ? { retailPrice: retail, packagePrice, formats } : null;
  const invalid = grid ? validateGrid(grid) : "retailPriceInvalid";
  const fields = {
    ...(retail ? {} : { retailPrice: "invalidAmount" as const }),
    ...(packageRaw && !packagePrice ? { packagePrice: "invalidAmount" as const } : {}),
    ...(formats ? {} : { formats: "invalidInput" as const }),
    ...(mode === "immediate" || mode === "after_sellout" ? {} : { mode: "invalidInput" as const }),
  };
  if (invalid || Object.keys(fields).length) return failure("invalidInput", fields);
  const supabase = await getServerSupabase();
  const estimate = Number(text(form, "remainingEstimate", 5)) || null;
  const { error } = await supabase.rpc("change_price", {
    p_product_id: productId,
    p_retail_price: retail!,
    p_package_price: packagePrice as number,
    p_formats: toRaw(formats!) as never,
    p_mode: mode,
    p_remaining_estimate: estimate as number,
  });
  if (error) {
    const code = errorFromDatabase(error);
    return failure(code, code === "estimateRequired" ? { remainingEstimate: code } : undefined);
  }
  revalidatePath(`/catalog/${productId}`);
  revalidatePath("/catalog");
  return success(null);
}

export async function cancelPendingPriceAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageCatalog");
  const productId = uuid(form, "productId");
  if (!account || !productId) return failure("forbidden");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("cancel_pending_price", { p_product_id: productId });
  if (error) return failure(errorFromDatabase(error));
  revalidatePath(`/catalog/${productId}`);
  return success(null);
}

/** Nom, catégorie, conditionnement, seuil de rachat, archivage (contenance et unité figées). */
export async function updateProductAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageCatalog");
  const productId = uuid(form, "productId");
  if (!account || !productId) return failure("forbidden");
  const name = text(form, "name", 80);
  if (!name) return failure("invalidInput", { name: "nameRequired" });
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("products")
    .update({
      name,
      category: text(form, "category", 40) || null,
      package_label: text(form, "packageLabel", 30) || "sac",
      reorder_threshold: Number(text(form, "reorderThreshold", 4)) || 0,
      archived_at: form.get("archived") === "true" ? new Date().toISOString() : null,
    })
    .eq("id", productId)
    .select("id");
  if (error) return failure(errorFromDatabase(error));
  if (!data?.length) return failure("forbidden");
  revalidatePath(`/catalog/${productId}`);
  revalidatePath("/catalog");
  return success(null);
}
