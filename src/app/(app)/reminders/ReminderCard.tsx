import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { amountOwed, customerHref, type ReminderReason } from "@/modules/customers";
import type { CustomerRow } from "@/modules/customers/server";
import { formatAmount, whatsAppLink } from "@/shared/domain";
import { Balance } from "@/shared/ui";

/** Un client à relancer : raisons, montant, et message WhatsApp prérempli (modifiable dans WhatsApp). */
export async function ReminderCard({ customer, reasons, shopName, compact = false }: { customer: CustomerRow; reasons: ReminderReason[]; shopName: string; compact?: boolean }) {
  const t = await getTranslations("reminders");
  const format = await getFormatter();
  const describe = (reason: ReminderReason) => {
    switch (reason.kind) {
      case "overdue":
        return t("reasons.overdue", { date: format.dateTime(new Date(`${reason.dueDate}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }), amount: formatAmount(reason.overdue) });
      case "overLimit":
        return t("reasons.overLimit", { amount: formatAmount(reason.excess) });
      case "lowAdvance":
        return t("reasons.lowAdvance", { threshold: formatAmount(reason.threshold) });
      case "noRecentPayment":
        return t("reasons.noRecentPayment", { days: reason.days });
    }
  };
  const message =
    customer.balance < 0
      ? t("message", { name: customer.fullName, shop: shopName, amount: formatAmount(amountOwed(customer.balance)) })
      : t("messageAdvance", { name: customer.fullName, shop: shopName, amount: formatAmount(customer.balance) });

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <Link href={customerHref(customer.id)} className="min-w-0 flex-1">
        <span className="block font-bold text-encre">{customer.fullName}</span>
        <ul className="text-sm text-gris-texte">
          {reasons.map((reason) => (
            <li key={reason.kind}>{describe(reason)}</li>
          ))}
        </ul>
      </Link>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Balance value={customer.balance} size="sm" />
        {compact ? null : customer.phone ? (
          <a
            href={whatsAppLink(message, customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-bouton bg-vert-principal px-4 text-sm font-bold text-white hover:bg-vert-fonce"
          >
            {t("send")}
          </a>
        ) : (
          <span className="text-xs text-gris-texte">{t("noPhone")}</span>
        )}
      </div>
    </div>
  );
}
