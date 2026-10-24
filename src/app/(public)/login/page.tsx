import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm, type LoginErrorCode } from "@/modules/auth-accounts";
import { LogoMark } from "@/shared/ui";

const PAGE_ERRORS = new Set<LoginErrorCode>(["accountDisabled", "tenantSuspended", "noAccess"]);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const t = await getTranslations();
  const initialError = PAGE_ERRORS.has(error as LoginErrorCode) ? (error as LoginErrorCode) : null;

  return (
    <main className="flex min-h-dvh flex-col md:items-center md:justify-center md:p-8">
      {/* Téléphone : bandeau vert en haut. Tablette / ordinateur : carte centrée. */}
      <div className="flex w-full flex-1 flex-col md:max-w-md md:flex-none md:overflow-hidden md:rounded-carte md:border md:border-bordure md:bg-surface md:shadow-sm">
        <header className="bg-vert-principal px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 text-white md:pt-10">
          <div className="flex items-center gap-3">
            <LogoMark size={48} />
            <div>
              <p className="text-3xl leading-none font-extrabold tracking-tight">{t("app.name")}</p>
              <p className="mt-1 text-base text-white/85">{t("app.tagline")}</p>
            </div>
          </div>
          <p className="mt-6 max-w-xs text-base leading-snug text-white/90">{t("app.description")}</p>
        </header>

        <section className="-mt-5 flex-1 rounded-t-[22px] bg-surface px-6 pt-7 pb-[max(2rem,env(safe-area-inset-bottom))] md:mt-0 md:rounded-none">
          <h1 className="text-2xl font-extrabold text-encre">{t("auth.login.title")}</h1>
          <p className="mt-1 mb-6 text-base text-gris-texte">{t("auth.login.intro")}</p>
          <LoginForm initialError={initialError} />
          <p className="mt-6 border-t border-bordure pt-4 text-xs text-gris-texte">{t("auth.login.needsNetwork")}</p>
        </section>
      </div>
    </main>
  );
}
