"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

/** Sélecteur de boutique courante (affiché seulement si l'utilisateur en a plusieurs). */
export function ShopSwitcher({
  action,
  shops,
  currentShopId,
  tone = "light",
}: {
  action: (form: FormData) => Promise<void>;
  shops: { id: string; name: string }[];
  currentShopId: string | null;
  tone?: "light" | "dark";
}) {
  const t = useTranslations("shell");
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  if (shops.length < 2) return null;
  const styles =
    tone === "dark"
      ? "border-white/25 bg-white/10 text-white [&>option]:text-encre"
      : "border-bordure-champ bg-surface text-encre";
  return (
    <form ref={formRef} action={action} className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {t("switchShop")}
      </label>
      <select
        id={id}
        name="shopId"
        defaultValue={currentShopId ?? undefined}
        onChange={() => formRef.current?.requestSubmit()}
        className={`h-11 w-full min-w-0 truncate rounded-xl border px-3 text-sm font-semibold ${styles}`}
      >
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">{t("switchShop")}</button>
      </noscript>
    </form>
  );
}
