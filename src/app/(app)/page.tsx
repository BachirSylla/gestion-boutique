import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { shopTotals } from "@/modules/customers";
import { countPendingRequests, getShopContext, listCustomers, listReminders } from "@/modules/customers/server";
import { getCurrentShop } from "@/modules/shops/server";
import { formatAmount } from "@/shared/domain";
import { Card, LinkButton, Notice } from "@/shared/ui";
import { ReminderCard } from "./reminders/ReminderCard";

export default async function HomePage() {
  const account = await requirePageAccount();
  const t = await getTranslations();

  if (can(account.role, "managePlatform")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">{t("home.greeting", { name: account.fullName })}</h1>
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
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">{t("home.greeting", { name: account.fullName })}</h1>
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
  const [customers, reminders, pending] = await Promise.all([
    listCustomers(shop.id),
    listReminders(context),
    can(account.role, "decideCancellations") ? countPendingRequests(shop.id) : Promise.resolve(0),
  ]);
  const totals = shopTotals(customers);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">{t("home.greeting", { name: account.fullName })}</h1>
        <p className="mt-1 text-gris-texte">{t("home.currentShop", { shop: shop.name })}</p>
      </div>

      {pending > 0 ? (
        <Link href="/cancellations" className="block">
          <Notice>{t("cancellations.pendingCount", { count: pending })}</Notice>
        </Link>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-carte bg-vert-principal p-6 text-white">
          <h2 className="text-base font-semibold text-white/85">{t("home.owedTitle")}</h2>
          <p className="montant mt-1 text-4xl font-extrabold sm:text-5xl">{formatAmount(totals.owedByCustomers)}</p>
          <p className="mt-2 text-sm text-white/85">
            {t("home.owedCount", { count: totals.customersInDebt })}
            <span> · </span>
            {t("home.advancesHeld", { amount: formatAmount(totals.advancesHeld) })}
          </p>
        </section>
        {can(account.role, "recordOperations") ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Link href="/take" className="flex min-h-20 items-center justify-center rounded-carte bg-safran px-4 text-center text-lg font-extrabold text-encre hover:brightness-95">
              {t("home.newTake")}
            </Link>
            <Link href="/payment" className="flex min-h-20 items-center justify-center rounded-carte bg-surface px-4 text-center text-lg font-extrabold text-vert-principal ring-2 ring-vert-principal hover:bg-vert-doux">
              {t("home.newPayment")}
            </Link>
          </div>
        ) : null}
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-encre">{t("home.remindersTitle")}</h2>
          {reminders.length ? (
            <Link href="/reminders" className="min-h-11 content-center text-sm font-semibold text-vert-fonce hover:underline">
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
                <ReminderCard customer={r.customer} reasons={r.reasons} shopName={shop.name} compact />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="rounded-carte bg-safran-doux px-5 py-4 text-sm text-encre">{t("home.nextMilestones")}</p>
    </div>
  );
}
