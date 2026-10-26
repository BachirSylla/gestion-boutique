import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { DaySalesCard } from "@/modules/cash";
import { HomeSummary } from "@/modules/customers";
import {
  countPendingRequests,
  getShopContext,
  listReminders,
} from "@/modules/customers/server";
import { RecentActivity, resolvePeriod } from "@/modules/reporting";
import { getProfitReport, MonthProfitCard } from "@/modules/reporting/server";
import { getCurrentShop } from "@/modules/shops/server";
import { StockWatch } from "@/modules/stock";
import { localDate } from "@/shared/domain";
import { Card, LinkButton, Notice } from "@/shared/ui";
import { ReminderCard } from "./reminders/ReminderCard";

export default async function HomePage() {
  const account = await requirePageAccount();
  const t = await getTranslations();

  if (can(account.role, "managePlatform")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">
          {t("home.greeting", { name: account.fullName })}
        </h1>
        <Card>
          <p className="text-base text-encre">{t("home.adminIntro")}</p>
          <div className="mt-4">
            <LinkButton href="/admin">{t("home.adminCta")}</LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  const shop = await getCurrentShop(account);
  if (!shop) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">
          {t("home.greeting", { name: account.fullName })}
        </h1>
        <Card>
          <p className="text-gris-texte">{t("home.noShop")}</p>
          {can(account.role, "manageShops") ? (
            <div className="mt-4">
              <LinkButton href="/shops">{t("shops.new")}</LinkButton>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  const context = await getShopContext(shop);
  const [reminders, pending, month] = await Promise.all([
    listReminders(context),
    can(account.role, "decideCancellations")
      ? countPendingRequests(shop.id)
      : Promise.resolve(0),
    // Bénéfice brut du mois : propriétaire et comptable seulement (le gérant voit les ventes du jour).
    can(account.role, "viewProfits")
      ? getProfitReport(
          shop,
          resolvePeriod({}, localDate(new Date(), shop.timezone)).period,
        )
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">
          {t("home.greeting", { name: account.fullName })}
        </h1>
        <p className="mt-1 text-gris-texte">
          {t("home.currentShop", { shop: shop.name })}
        </p>
      </div>

      {pending > 0 ? (
        <Link href="/cancellations" className="block">
          <Notice>{t("cancellations.pendingCount", { count: pending })}</Notice>
        </Link>
      ) : null}

      <HomeSummary
        shopId={shop.id}
        canRecord={can(account.role, "recordOperations")}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <DaySalesCard
          shopId={shop.id}
          timeZone={shop.timezone}
          canClose={can(account.role, "recordOperations")}
        />
        {month ? (
          <MonthProfitCard
            profit={month.profit.total}
            collected={month.cash.collected}
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-encre">
              {t("home.remindersTitle")}
            </h2>
            {reminders.length ? (
              <Link
                href="/reminders"
                className="min-h-11 content-center text-sm font-semibold text-vert-fonce hover:underline"
              >
                {t("home.seeAll")}
              </Link>
            ) : null}
          </div>
          {reminders.length === 0 ? (
            <p className="text-gris-texte">{t("home.noReminder")}</p>
          ) : (
            <ul className="-mx-4 flex flex-col divide-y divide-bordure">
              {reminders.slice(0, 5).map((r) => (
                <li key={r.customer.id}>
                  <ReminderCard
                    customer={r.customer}
                    reasons={r.reasons}
                    shopName={shop.name}
                    compact
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <StockWatch shopId={shop.id} />
      </div>

      <RecentActivity shopId={shop.id} timeZone={shop.timezone} />
    </div>
  );
}
