"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavIcon = "home" | "admin" | "team" | "shops" | "account" | "customers" | "reminders" | "menu" | "cancellations" | "settings" | "catalog" | "stock" | "cash" | "profits";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Pastille de compteur (ex. demandes en attente), masquée si 0. */
  badge?: number;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Liens de navigation : barre du bas (téléphone) ou menu latéral (ordinateur). */
export function NavLinks({ items, variant, label }: { items: NavItem[]; variant: "bottom" | "side"; label: string }) {
  const pathname = usePathname();
  if (variant === "bottom") {
    return (
      <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-40 border-t border-bordure bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold ${
                    active ? "text-vert-principal" : "text-gris-texte"
                  }`}
                >
                  <span className="relative">
                    <Icon name={item.icon} />
                    <Pastille count={item.badge} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-bouton px-3 font-semibold ${
                  active ? "bg-white text-vert-principal" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? <span className="montant rounded-full bg-safran px-2 text-xs font-extrabold text-encre">{item.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const PATHS: Record<NavIcon, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  admin: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h.01M16 11h.01",
  team: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74",
  shops: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  account: "M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  customers: "M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zM18 8h2M18 12h2M18 16h2M8 9h6M8 13h6",
  reminders: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  catalog: "M20 7 12 3 4 7l8 4 8-4zM4 7v10l8 4M20 7v10l-8 4M12 11v10",
  stock: "M6 4h12l2 17H4zM9 4c0 2 1.3 3 3 3s3-1 3-3",
  cash: "M3 7h18v11H3zM3 11h18M7 15h3M16 4H8",
  profits: "M3 20h18M6 16l4-5 3 3 5-7M14 7h4v4",
  cancellations: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
};

function Pastille({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="montant absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-safran px-1 text-center text-[11px] leading-5 font-extrabold text-encre">
      {count}
    </span>
  );
}

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
