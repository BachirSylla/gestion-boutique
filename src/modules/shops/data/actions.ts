"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { authorizeAction } from "@/modules/auth-accounts/server";
import { errorFromDatabase, failure, success, type ActionState } from "@/shared/server/action-state";
import { optionalText, phone, text, uuid } from "@/shared/server/form";
import { getAdminSupabase } from "@/shared/supabase/admin";
import { getServerSupabase } from "@/shared/supabase/server";
import { CURRENT_SHOP_COOKIE } from "./current-shop";

/** Choix de la boutique courante (seulement parmi les boutiques accessibles). */
export async function setCurrentShopAction(form: FormData): Promise<void> {
  const account = await authorizeAction();
  const shopId = uuid(form, "shopId");
  if (!account || !shopId || !account.shops.some((s) => s.id === shopId)) return;
  (await cookies()).set(CURRENT_SHOP_COOKIE, shopId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

function readShopFields(form: FormData) {
  const rawPhone = text(form, "phone", 40);
  return {
    name: text(form, "name"),
    district: optionalText(form, "district"),
    city: optionalText(form, "city"),
    rawPhone,
    phone: rawPhone ? phone(form, "phone") : null,
  };
}

export async function createShopAction(_previous: ActionState<{ shopId: string }>, form: FormData): Promise<ActionState<{ shopId: string }>> {
  const account = await authorizeAction("manageShops");
  if (!account?.tenantId) return failure("forbidden");
  const shop = readShopFields(form);
  if (!shop.name) return failure("invalidInput", { name: "nameRequired" });
  if (shop.rawPhone && !shop.phone) return failure("invalidInput", { phone: "invalidPhone" });

  const { data: shopId, error } = await getAdminSupabase().rpc("srv_create_shop", {
    p_actor: account.userId,
    p_tenant_id: account.tenantId,
    p_name: shop.name,
    p_district: shop.district ?? undefined,
    p_city: shop.city ?? undefined,
    p_phone: shop.phone ?? undefined,
  });
  if (error || !shopId) return failure(error ? errorFromDatabase(error) : "unexpected");
  revalidatePath("/", "layout");
  return success({ shopId });
}

/** Modification par le propriétaire : passe par la RLS (client au nom de l'utilisateur). */
export async function updateShopAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await authorizeAction("manageShops");
  if (!account) return failure("forbidden");
  const shopId = uuid(form, "shopId");
  const shop = readShopFields(form);
  if (!shopId) return failure("notFound");
  if (!shop.name) return failure("invalidInput", { name: "nameRequired" });
  if (shop.rawPhone && !shop.phone) return failure("invalidInput", { phone: "invalidPhone" });

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("shops")
    .update({ name: shop.name, district: shop.district, city: shop.city, phone_e164: shop.phone })
    .eq("id", shopId)
    .select("id");
  if (error) return failure(errorFromDatabase(error));
  if (!data?.length) return failure("forbidden");
  revalidatePath("/", "layout");
  return success(null);
}
