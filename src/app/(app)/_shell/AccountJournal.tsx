import { getFormatter, getTranslations } from "next-intl/server";
import type { AccountEvent } from "@/modules/auth-accounts/server";

/** Journal des actions sur les comptes (qui a fait quoi, quand). */
export async function AccountJournal({ events, names }: { events: AccountEvent[]; names: Map<string, string> }) {
  const t = await getTranslations("events");
  const format = await getFormatter();
  if (events.length === 0) return null;
  const nameOf = (id: string | null, fallback: string) => (id ? (names.get(id) ?? fallback) : fallback);
  return (
    <ol className="flex flex-col divide-y divide-bordure">
      {events.map((event) => (
        <li key={event.id} className="py-3">
          <p className="font-semibold text-encre">{t(event.type as "member_created", { target: nameOf(event.targetUserId, t("someone")) })}</p>
          <p className="text-sm text-gris-texte">
            {format.dateTime(new Date(event.createdAt), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            <span> · </span>
            {t("by", { actor: nameOf(event.actorId, t("platformAdmin")) })}
          </p>
        </li>
      ))}
    </ol>
  );
}
