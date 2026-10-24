"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavIcon = "home" | "admin" | "team" | "shops" | "account";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
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
                  <Icon name={item.icon} />
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
                {item.label}
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
};

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
