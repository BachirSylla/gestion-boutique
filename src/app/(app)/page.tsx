import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { getCurrentShop } from "@/modules/shops/server";
import { Card, LinkButton } from "@/shared/ui";

export default async function HomePage() {
  const account = await requirePageAccount();
  const t = await getTranslations();
  const currentShop = await getCurrentShop(account);
  const roleLabel = account.role ? t(`accounts.roles.${account.role}`) : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">{t("home.greeting", { name: account.fullName })}</h1>
        <p className="mt-1 text-base text-gris-texte">
          {roleLabel}
          {account.tenantName ? <span> · {account.tenantName}</span> : null}
        </p>
      </div>

      {can(account.role, "managePlatform") ? (
        <Card>
          <p className="text-base text-encre">{t("home.adminIntro")}</p>
          <div className="mt-4">
            <LinkButton href="/admin">{t("home.adminCta")}</LinkButton>
          </div>
        </Card>
      ) : (
        <Card>
          {currentShop ? <p className="mb-3 text-base font-semibold text-vert-fonce">{t("home.currentShop", { shop: currentShop.name })}</p> : null}
          <h2 className="text-lg font-bold text-encre">{t("home.yourShops", { count: account.shops.length })}</h2>
          {account.shops.length === 0 ? (
            <p className="mt-2 text-gris-texte">{t("home.noShop")}</p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {account.shops.map((shop) => (
                <li key={shop.id} className="rounded-bouton bg-vert-doux px-4 py-3">
                  <p className="font-bold text-vert-fonce">{shop.name}</p>
                  {shop.district || shop.city ? <p className="text-sm text-gris-texte">{[shop.district, shop.city].filter(Boolean).join(", ")}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {can(account.role, "manageTeam") ? (
            <div className="mt-4">
              <LinkButton href="/team" variant="secondary">
                {t("home.ownerTeamCta")}
              </LinkButton>
            </div>
          ) : null}
        </Card>
      )}

      <p className="rounded-carte bg-safran-doux px-5 py-4 text-sm text-encre">{t("home.comingSoon")}</p>
    </div>
  );
}
