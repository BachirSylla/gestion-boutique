import { getTranslations } from "next-intl/server";
import type { Capability } from "@/modules/auth-accounts";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { getCurrentShop } from "@/modules/shops/server";
import { Card } from "@/shared/ui";

/** Page qui travaille dans la boutique courante : compte autorisé + boutique (ou null). */
export async function requireShopPage(capability: Capability) {
  const account = await requirePageAccount(capability);
  const shop = await getCurrentShop(account);
  return { account, shop };
}

export async function NoShop() {
  const t = await getTranslations("common");
  return (
    <Card>
      <p className="text-gris-texte">{t("noShopYet")}</p>
    </Card>
  );
}
