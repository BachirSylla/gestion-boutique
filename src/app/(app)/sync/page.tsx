import { getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { SyncPanel } from "@/modules/sync";
import { PageHeader } from "@/shared/ui";

export default async function SyncPage() {
  await requirePageAccount("workInShop");
  const t = await getTranslations("sync");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} />
      <SyncPanel />
    </div>
  );
}
