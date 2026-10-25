"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatPhone, type Amount } from "@/shared/domain";
import { Balance } from "@/shared/ui";
import { CUSTOMER_TYPES, matchesCustomer, type CustomerType } from "../domain/customers";

export interface CustomerListItem {
  id: string;
  fullName: string;
  phone: string | null;
  type: CustomerType;
  balance: Amount;
  lastOperationAt: string | null;
  /** Créé ou modifié sur l'appareil, pas encore envoyé. */
  pending?: boolean;
}

type Sort = "recent" | "debt" | "name";

/**
 * Liste des clients : recherche dès la première lettre (nom ou numéro), filtre par type,
 * tri (récents en tête par défaut). `hrefFor` choisit la destination (fiche, prise, versement).
 */
export function CustomerList({
  customers,
  hrefFor,
  autoFocus = false,
}: {
  customers: CustomerListItem[];
  hrefFor: (id: string) => string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("customers");
  const ts = useTranslations("sync");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CustomerType | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");

  const visible = useMemo(() => {
    const filtered = customers.filter((c) => (type === "all" || c.type === type) && matchesCustomer(c, query));
    const sorters: Record<Sort, (a: CustomerListItem, b: CustomerListItem) => number> = {
      recent: (a, b) => (b.lastOperationAt ?? "").localeCompare(a.lastOperationAt ?? "") || a.fullName.localeCompare(b.fullName, "fr"),
      debt: (a, b) => a.balance - b.balance,
      name: (a, b) => a.fullName.localeCompare(b.fullName, "fr"),
    };
    return filtered.sort(sorters[sort]);
  }, [customers, query, type, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="customer-search">
          {tc("search")}
        </label>
        <input
          id="customer-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          autoFocus={autoFocus}
          autoComplete="off"
          className="h-13 w-full rounded-bouton border border-bordure-champ bg-surface px-4 text-lg text-encre outline-none focus:border-vert-principal focus:ring-2 focus:ring-vert-principal/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          {(["all", ...CUSTOMER_TYPES] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => setType(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${type === value ? "bg-vert-principal text-white" : "bg-surface text-encre ring-1 ring-bordure"}`}
            >
              {value === "all" ? tc("all") : t(`types.${value}`)}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-gris-texte">
            <span>{t("sort.label")}</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-10 rounded-xl border border-bordure-champ bg-surface px-2 font-semibold text-encre"
            >
              <option value="recent">{t("sort.recent")}</option>
              <option value="debt">{t("sort.debt")}</option>
              <option value="name">{t("sort.name")}</option>
            </select>
          </label>
        </div>
      </div>

      <p className="text-sm text-gris-texte" aria-live="polite">
        {t("count", { count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-carte bg-surface p-5 text-gris-texte">{customers.length ? t("noResult") : t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bordure overflow-hidden rounded-carte border border-bordure bg-surface">
          {visible.map((customer) => (
            <li key={customer.id}>
              <a href={hrefFor(customer.id)} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-fond">
                <span
                  aria-hidden="true"
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                    customer.balance < 0 ? "bg-brique-doux text-brique" : "bg-vert-doux text-vert-fonce"
                  }`}
                >
                  {initials(customer.fullName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-encre">
                    {customer.fullName}
                    {customer.pending ? <span className="ml-2 align-middle text-xs font-semibold text-safran">{ts("pendingShort")}</span> : null}
                  </span>
                  <span className="block truncate text-sm text-gris-texte">
                    {t(`types.${customer.type}`)}
                    {customer.phone ? <span className="montant"> · {formatPhone(customer.phone)}</span> : null}
                  </span>
                </span>
                <Balance value={customer.balance} size="sm" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
