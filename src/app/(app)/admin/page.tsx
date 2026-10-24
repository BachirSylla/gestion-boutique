import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { listTenants } from "@/modules/platform-admin/server";
import { formatPhone } from "@/shared/domain";
import { Badge, Card, LinkButton, PageHeader } from "@/shared/ui";

export default async function AdminPage() {
  await requirePageAccount("managePlatform");
  const t = await getTranslations();
  const format = await getFormatter();
  const tenants = await listTenants();

  return (
    <>
      <PageHeader title={t("admin.title")} intro={t("admin.intro")} action={<LinkButton href="/admin/new" variant="accent">{t("admin.newOwner")}</LinkButton>} />
      {tenants.length === 0 ? (
        <Card>
          <p className="text-gris-texte">{t("admin.empty")}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <Link href={`/admin/${tenant.id}`} className="block rounded-carte border border-bordure bg-surface p-5 hover:border-vert-principal">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-bold text-encre">{tenant.name}</p>
                  <Badge tone={tenant.status === "active" ? "positive" : "danger"}>{t(`accounts.status.${tenant.status}`)}</Badge>
                </div>
                {tenant.owner ? (
                  <p className="mt-1 text-sm text-gris-texte">
                    {tenant.owner.fullName}
                    {tenant.owner.phone ? <span className="montant"> · {formatPhone(tenant.owner.phone)}</span> : null}
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-gris-texte">
                  {t("admin.shopsCount", { count: tenant.shops.filter((s) => !s.archived).length })}
                  <span> · </span>
                  {t("admin.createdOn", { date: format.dateTime(new Date(tenant.createdAt), "short") })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
