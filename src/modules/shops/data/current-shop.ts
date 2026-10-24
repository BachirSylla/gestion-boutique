import "server-only";

import { cookies } from "next/headers";
import type { CurrentAccount, ShopSummary } from "@/modules/auth-accounts/server";
import { pickCurrentShopId } from "../domain/current-shop";

export const CURRENT_SHOP_COOKIE = "bitig_shop";

/** Boutique courante de l'utilisateur, choisie parmi ses boutiques accessibles (déjà filtrées par la RLS). */
export async function getCurrentShop(account: Pick<CurrentAccount, "shops">): Promise<ShopSummary | null> {
  const preferred = (await cookies()).get(CURRENT_SHOP_COOKIE)?.value;
  const id = pickCurrentShopId(
    account.shops.map((s) => s.id),
    preferred,
  );
  return account.shops.find((s) => s.id === id) ?? null;
}
