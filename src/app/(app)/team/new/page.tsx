import { getTranslations } from "next-intl/server";
import { CreateMemberForm } from "@/modules/auth-accounts";
import { createMemberAction, requirePageAccount } from "@/modules/auth-accounts/server";
import { Card, PageHeader } from "@/shared/ui";

export default async function NewMemberPage() {
  const account = await requirePageAccount("manageTeam");
  const t = await getTranslations();
  const shops = account.shops.map((s) => ({ id: s.id, name: s.name, place: [s.district, s.city].filter(Boolean).join(", ") || null }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("team.create.title")} intro={t("team.create.intro")} back={{ href: "/team", label: t("team.title") }} />
      <Card>
        <CreateMemberForm action={createMemberAction} shops={shops} />
      </Card>
    </div>
  );
}
