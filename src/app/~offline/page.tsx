import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/shared/ui";
import { RetryButton } from "./RetryButton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offlinePage");
  return { title: t("title") };
}

/** Page de secours servie par le service worker quand une page n'est pas en cache et qu'il n'y a pas de réseau. */
export default async function OfflinePage() {
  const t = await getTranslations("offlinePage");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={56} />
      <h1 className="text-2xl font-extrabold text-encre">{t("title")}</h1>
      <p className="text-base text-gris-texte">{t("body")}</p>
      <RetryButton label={t("retry")} />
    </main>
  );
}
