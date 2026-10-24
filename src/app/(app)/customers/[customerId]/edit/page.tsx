import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { CustomerForm } from "@/modules/customers";
import { getCustomerDetail, getShopContext, saveCustomerAction, setCustomerArchivedAction } from "@/modules/customers/server";
import { formatAmount } from "@/shared/domain";
import { Card, ConfirmActionForm, PageHeader } from "@/shared/ui";

export default async function EditCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const account = await requirePageAccount("manageCustomers");
  const { customerId } = await params;
  const detail = await getCustomerDetail(customerId);
  const shop = detail ? account.shops.find((s) => s.id === detail.customer.shopId) : undefined;
  if (!detail || !shop) notFound();
  const { customer } = detail;
  const t = await getTranslations("customers");
  const context = await getShopContext(shop);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("edit")} intro={customer.fullName} back={{ href: `/customers/${customer.id}`, label: customer.fullName }} />
      <div className="flex flex-col gap-6">
        <Card>
          <CustomerForm action={saveCustomerAction} initial={customer} defaultAlertThreshold={context.settings.advanceAlertThreshold} />
        </Card>
        <Card>
          <ConfirmActionForm
            action={setCustomerArchivedAction}
            fields={{ customerId: customer.id, archived: customer.archived ? "false" : "true" }}
            label={customer.archived ? t("unarchive") : t("archive")}
            confirmText={
              customer.archived
                ? undefined
                : customer.balance !== 0
                  ? t("archiveConfirmBalance", { amount: formatAmount(customer.balance, { signDisplay: "always" }) })
                  : t("archiveConfirm")
            }
            variant="ghost"
          />
        </Card>
      </div>
    </div>
  );
}
