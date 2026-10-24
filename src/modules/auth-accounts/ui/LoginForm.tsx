"use client";

import { useIsOffline } from "@/shared/pwa";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { getBrowserSupabase } from "@/shared/supabase/browser";
import { Button, TextField } from "@/shared/ui";
import { loginErrorFromAuth, parseLoginInput, type LoginErrorCode } from "../domain/credentials";

/**
 * Connexion depuis le navigateur : chaque appareil parle directement à Supabase Auth
 * (pas de limite de débit partagée derrière l'adresse du serveur). La session est posée
 * dans les cookies, lue ensuite par le serveur et le proxy.
 */
export function LoginForm({ initialError }: { initialError?: LoginErrorCode | null }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const isOffline = useIsOffline();
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ phone?: LoginErrorCode; password?: LoginErrorCode; form?: LoginErrorCode | null }>({
    form: initialError ?? null,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = parseLoginInput(String(form.get("phone") ?? ""), String(form.get("password") ?? ""));
    if (!input.ok) {
      setErrors({ [input.field]: input.error });
      return;
    }
    if (isOffline) {
      setErrors({ form: "offline" });
      return;
    }
    setErrors({});
    startTransition(async () => {
      try {
        const { error } = await getBrowserSupabase().auth.signInWithPassword({ email: input.email, password: input.password });
        if (error) {
          setErrors({ form: loginErrorFromAuth(error) });
          return;
        }
        router.replace("/");
        router.refresh();
      } catch {
        setErrors({ form: navigator.onLine ? "unexpected" : "offline" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {errors.form ? (
        <p role="alert" className="rounded-bouton bg-brique-doux px-4 py-3 text-sm font-semibold text-brique">
          {t(`errors.${errors.form}`)}
        </p>
      ) : null}

      <TextField
        label={t("login.phoneLabel")}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="username"
        placeholder={t("login.phonePlaceholder")}
        leading="+221"
        required
        error={errors.phone ? t(`errors.${errors.phone}`) : null}
      />

      <TextField
        label={t("login.passwordLabel")}
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        required
        error={errors.password ? t(`errors.${errors.password}`) : null}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
            aria-pressed={showPassword}
            className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-gris-texte hover:bg-vert-doux hover:text-vert-fonce"
          >
            <EyeIcon crossed={showPassword} />
          </button>
        }
      />

      <Button type="submit" block disabled={pending} className="mt-1 text-lg">
        {pending ? t("login.submitting") : t("login.submit")}
      </Button>

      <p className="text-sm leading-relaxed text-gris-texte">{t("login.forgotten")}</p>
    </form>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}
