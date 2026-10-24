import { getTranslations } from "next-intl/server";
import { getShopContext, listReminders } from "@/modules/customers/server";
import { Card, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";
import { ReminderCard } from "./ReminderCard";

export default async function RemindersPage() {
  const { shop } = await requireShopPage("viewCustomers");
  const t = await getTranslations("reminders");
  if (!shop) return <NoShop />;
  const reminders = await listReminders(await getShopContext(shop));
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      {reminders.length === 0 ? (
        <Card>
          <p className="text-gris-texte">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y divide-bordure overflow-hidden rounded-carte border border-bordure bg-surface">
          {reminders.map((r) => (
            <li key={r.customer.id}>
              <ReminderCard customer={r.customer} reasons={r.reasons} shopName={shop.name} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
