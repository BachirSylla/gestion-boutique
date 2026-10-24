import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { getCustomerDetail, getShopContext } from "@/modules/customers/server";
import { TakeForm } from "@/modules/ledger";
import { recordTakeAction } from "@/modules/ledger/server";
import { Balance, PageHeader } from "@/shared/ui";

export default async function TakePage({ params }: { params: Promise<{ customerId: string }> }) {
  const account = await requirePageAccount("recordOperations");
  const { customerId } = await params;
  const detail = await getCustomerDetail(customerId);
  const shop = detail ? account.shops.find((s) => s.id === detail.customer.shopId) : undefined;
  if (!detail || !shop) notFound();
  if (detail.customer.archived) redirect(`/customers/${customerId}`);
  const { customer } = detail;
  const t = await getTranslations("ledger");
  const context = await getShopContext(shop);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("takeTitle")}
        intro={customer.fullName}
        back={{ href: `/customers/${customer.id}`, label: customer.fullName }}
        action={
          <div className="text-right">
            <p className="text-xs font-semibold text-gris-texte">{t("currentBalance")}</p>
            <Balance value={customer.balance} />
          </div>
        }
      />
      <TakeForm action={recordTakeAction} customerId={customer.id} balance={customer.balance} creditLimit={customer.creditLimit} roundingStep={context.settings.roundingStep} />
    </div>
  );
}
