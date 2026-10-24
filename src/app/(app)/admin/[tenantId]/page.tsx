import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountActionButton } from "@/modules/auth-accounts";
import { listAccountEvents, requirePageAccount } from "@/modules/auth-accounts/server";
import { createShopForTenantAction, getTenant, resetOwnerPasswordAction, setTenantStatusAction } from "@/modules/platform-admin/server";
import { ShopForm } from "@/modules/shops";
import { formatPhone } from "@/shared/domain";
import { Badge, Card, Notice, PageHeader } from "@/shared/ui";
import { AccountJournal } from "../../_shell/AccountJournal";

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePageAccount("managePlatform");
  const { tenantId } = await params;
  const tenant = await getTenant(tenantId);
  if (!tenant) notFound();
  const t = await getTranslations();
  const events = await listAccountEvents(tenant.id);
  const names = new Map(tenant.owner ? [[tenant.owner.userId, tenant.owner.fullName]] : []);
  const suspended = tenant.status === "suspended";

  return (
    <>
      <PageHeader title={tenant.name} back={{ href: "/admin", label: t("admin.title") }} action={<Badge tone={suspended ? "danger" : "positive"}>{t(`accounts.status.${tenant.status}`)}</Badge>} />
      {suspended ? (
        <div className="mb-6">
          <Notice tone="danger">{t("admin.detail.suspendedNotice")}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-bold text-encre">{t("admin.detail.shops")}</h2>
            {tenant.shops.length === 0 ? (
              <p className="mt-2 text-gris-texte">{t("admin.detail.noShop")}</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {tenant.shops.map((shop) => (
                  <li key={shop.id} className="rounded-bouton bg-vert-doux px-4 py-3">
                    <p className="font-bold text-vert-fonce">{shop.name}</p>
                    {shop.district || shop.city ? <p className="text-sm text-gris-texte">{[shop.district, shop.city].filter(Boolean).join(", ")}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold text-encre">{t("admin.detail.addShop")}</h2>
            <ShopForm
              action={createShopForTenantAction}
              hidden={{ tenantId: tenant.id }}
              submitLabel={t("admin.detail.addShop")}
              successLabel={t("shops.created")}
              withPhone={false}
            />
          </Card>
          {events.length > 0 ? (
            <Card>
              <h2 className="mb-2 text-lg font-bold text-encre">{t("admin.detail.journal")}</h2>
              <AccountJournal events={events} names={names} />
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {tenant.owner ? (
            <Card>
              <h2 className="text-lg font-bold text-encre">{t("admin.owner")}</h2>
              <p className="mt-2 font-semibold text-encre">{tenant.owner.fullName}</p>
              {tenant.owner.phone ? <p className="montant text-gris-texte">{formatPhone(tenant.owner.phone)}</p> : null}
              {tenant.owner.mustChangePassword ? (
                <div className="mt-2">
                  <Badge tone="warning">{t("accounts.status.mustChangePassword")}</Badge>
                </div>
              ) : null}
              <div className="mt-4">
                <AccountActionButton
                  action={resetOwnerPasswordAction}
                  fields={{ userId: tenant.owner.userId }}
                  label={t("admin.detail.resetPassword")}
                  confirmText={t("admin.detail.resetConfirm")}
                />
              </div>
            </Card>
          ) : null}
          <Card>
            <h2 className="mb-4 text-lg font-bold text-encre">{t("admin.detail.account")}</h2>
            <AccountActionButton
              action={setTenantStatusAction}
              fields={{ tenantId: tenant.id, status: suspended ? "active" : "suspended" }}
              label={suspended ? t("admin.detail.reactivate") : t("admin.detail.suspend")}
              confirmText={suspended ? t("admin.detail.reactivate") : t("admin.detail.suspendConfirm")}
              variant={suspended ? "primary" : "ghost"}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
