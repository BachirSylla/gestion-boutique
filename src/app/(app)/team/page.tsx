import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listAccountEvents, listTeam, requirePageAccount } from "@/modules/auth-accounts/server";
import { formatPhone } from "@/shared/domain";
import { Badge, Card, LinkButton, PageHeader } from "@/shared/ui";
import { AccountJournal } from "../_shell/AccountJournal";

export default async function TeamPage() {
  const account = await requirePageAccount("manageTeam");
  const t = await getTranslations();
  const tenantId = account.tenantId!;
  const [team, events] = await Promise.all([listTeam(tenantId), listAccountEvents(tenantId)]);
  const employees = team.filter((m) => m.role !== "owner");
  const shopName = new Map(account.shops.map((s) => [s.id, s.name]));
  const names = new Map(team.map((m) => [m.userId, m.userId === account.userId ? t("team.you") : m.fullName]));

  return (
    <>
      <PageHeader title={t("team.title")} intro={t("team.intro")} action={<LinkButton href="/team/new" variant="accent">{t("team.newMember")}</LinkButton>} />
      {employees.length === 0 ? (
        <Card>
          <p className="text-gris-texte">{t("team.empty")}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {employees.map((member) => (
            <li key={member.userId}>
              <Link href={`/team/${member.userId}`} className="block rounded-carte border border-bordure bg-surface p-5 hover:border-vert-principal">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-encre">{member.fullName}</p>
                    <p className="text-sm text-gris-texte">
                      {t(`accounts.roles.${member.role}`)}
                      {member.phone ? <span className="montant"> · {formatPhone(member.phone)}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={member.status === "active" ? "positive" : "danger"}>{t(`accounts.status.${member.status}`)}</Badge>
                    {member.mustChangePassword && member.status === "active" ? <Badge tone="warning">{t("accounts.status.mustChangePassword")}</Badge> : null}
                  </div>
                </div>
                <p className="mt-3 text-sm text-gris-texte">
                  {member.shopIds.length ? member.shopIds.map((id) => shopName.get(id)).filter(Boolean).join(", ") : t("team.shopsOf", { count: 0 })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {events.length > 0 ? (
        <Card className="mt-6">
          <h2 className="mb-2 text-lg font-bold text-encre">{t("admin.detail.journal")}</h2>
          <AccountJournal events={events} names={names} />
        </Card>
      ) : null}
    </>
  );
}
