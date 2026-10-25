import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount, signOutAction } from "@/modules/auth-accounts/server";
import { countPendingRequests } from "@/modules/customers/server";
import { getCurrentShop } from "@/modules/shops/server";
import { SignOutButton } from "@/modules/sync";
import { Badge, PageHeader } from "@/shared/ui";
import { navigation } from "../_shell/nav";

/** Menu du téléphone : tout ce qui n'est pas dans la barre du bas. */
export default async function MenuPage() {
  const account = await requirePageAccount();
  const t = await getTranslations();
  const shop = await getCurrentShop(account);
  const pending = shop && can(account.role, "decideCancellations") ? await countPendingRequests(shop.id) : 0;
  const { all, bottom } = await navigation(account, pending);
  const inBottom = new Set(bottom.map((item) => item.href));
  const entries = all.filter((item) => !inBottom.has(item.href));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("menu.title")} />
      <ul className="flex flex-col divide-y divide-bordure overflow-hidden rounded-carte border border-bordure bg-surface">
        {entries.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-14 items-center justify-between px-5 font-semibold text-encre hover:bg-fond">
              {item.label}
              {item.badge ? <Badge tone="warning">{item.badge}</Badge> : <span aria-hidden="true">→</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <SignOutButton action={signOutAction} userId={account.userId} />
      </div>
    </div>
  );
}
