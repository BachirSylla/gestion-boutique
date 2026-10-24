import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountActionButton, MemberShopsForm } from "@/modules/auth-accounts";
import { getTeamMember, requirePageAccount, resetMemberPasswordAction, setMemberShopsAction, setMemberStatusAction } from "@/modules/auth-accounts/server";
import { formatPhone } from "@/shared/domain";
import { Badge, Card, Notice, PageHeader } from "@/shared/ui";

export default async function MemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const account = await requirePageAccount("manageTeam");
  const { userId } = await params;
  const member = await getTeamMember(account.tenantId!, userId);
  if (!member || member.role === "owner") notFound();
  const t = await getTranslations();
  const disabled = member.status === "disabled";
  const shops = account.shops.map((s) => ({ id: s.id, name: s.name, place: [s.district, s.city].filter(Boolean).join(", ") || null }));

  return (
    <>
      <PageHeader
        title={member.fullName}
        intro={`${t(`accounts.roles.${member.role}`)}${member.phone ? ` · ${formatPhone(member.phone)}` : ""}`}
        back={{ href: "/team", label: t("team.title") }}
        action={<Badge tone={disabled ? "danger" : "positive"}>{t(`accounts.status.${member.status}`)}</Badge>}
      />
      {disabled ? (
        <div className="mb-6">
          <Notice tone="danger">{t("team.detail.disabledNotice")}</Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <MemberShopsForm action={setMemberShopsAction} userId={member.userId} shops={shops} selected={member.shopIds} />
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold text-encre">{t("team.detail.account")}</h2>
          <div className="flex flex-col gap-3">
            {!disabled ? (
              <AccountActionButton
                action={resetMemberPasswordAction}
                fields={{ userId: member.userId }}
                label={t("team.detail.resetPassword")}
                confirmText={t("team.detail.resetConfirm")}
              />
            ) : null}
            <AccountActionButton
              action={setMemberStatusAction}
              fields={{ userId: member.userId, status: disabled ? "active" : "disabled" }}
              label={disabled ? t("team.detail.enable") : t("team.detail.disable")}
              confirmText={disabled ? t("team.detail.enable") : t("team.detail.disableConfirm")}
              variant={disabled ? "primary" : "ghost"}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
