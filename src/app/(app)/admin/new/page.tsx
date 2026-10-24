import { getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { CreateOwnerForm } from "@/modules/platform-admin";
import { createTenantAction } from "@/modules/platform-admin/server";
import { Card, PageHeader } from "@/shared/ui";

export default async function NewOwnerPage() {
  await requirePageAccount("managePlatform");
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("admin.create.title")} intro={t("admin.create.intro")} back={{ href: "/admin", label: t("admin.title") }} />
      <Card>
        <CreateOwnerForm action={createTenantAction} />
      </Card>
    </div>
  );
}
