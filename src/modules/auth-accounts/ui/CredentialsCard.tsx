"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatPhone, whatsAppLink } from "@/shared/domain";
import { Button } from "@/shared/ui";
import type { IssuedCredentials } from "../domain/credentials-share";

/** Affiche une seule fois le mot de passe provisoire, avec copie et envoi WhatsApp. */
export function CredentialsCard({ credentials }: { credentials: IssuedCredentials }) {
  const t = useTranslations("credentials");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const message = t("message", {
    name: credentials.fullName,
    url: typeof window === "undefined" ? "" : window.location.origin,
    phone: formatPhone(credentials.phone),
    password: credentials.temporaryPassword,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="credentials-title" className="rounded-carte border-2 border-safran bg-safran-doux p-5">
      <h2 id="credentials-title" className="text-lg font-extrabold text-encre">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-encre">{t("intro", { name: credentials.fullName })}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-bouton bg-surface px-4 py-3">
          <dt className="text-xs font-semibold text-gris-texte">{t("phone")}</dt>
          <dd className="montant text-lg font-bold text-encre">{formatPhone(credentials.phone)}</dd>
        </div>
        <div className="rounded-bouton bg-surface px-4 py-3">
          <dt className="text-xs font-semibold text-gris-texte">{t("password")}</dt>
          <dd className="montant text-lg font-bold tracking-wide text-encre" data-testid="temporary-password">
            {credentials.temporaryPassword}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsAppLink(message, credentials.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-bouton bg-vert-principal px-5 font-bold text-white hover:bg-vert-fonce"
        >
          {t("whatsapp")}
        </a>
        <Button variant="secondary" onClick={copy} className="flex-1">
          {copied ? tc("copied") : t("copy")}
        </Button>
      </div>
    </section>
  );
}
