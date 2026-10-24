import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-carte border border-bordure bg-surface p-5 ${className}`}>{children}</section>;
}

export function PageHeader({ title, intro, action, back }: { title: string; intro?: string; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6">
      {back ? (
        <Link href={back.href} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-vert-fonce hover:underline">
          <span aria-hidden="true">←</span>
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">{title}</h1>
          {intro ? <p className="mt-1 text-base text-gris-texte">{intro}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

type Tone = "neutral" | "positive" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-fond text-gris-texte",
  positive: "bg-vert-doux text-vert-fonce",
  warning: "bg-safran-doux text-encre",
  danger: "bg-brique-doux text-brique",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${TONES[tone]}`}>{children}</span>;
}

export function Notice({ children, tone = "warning" }: { children: ReactNode; tone?: Tone }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-bouton px-4 py-3 text-sm font-semibold ${TONES[tone]}`}>
      {children}
    </p>
  );
}

/** Lien présenté comme un bouton. */
export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "accent" | "secondary" }) {
  const styles = {
    primary: "bg-vert-principal text-white hover:bg-vert-fonce",
    accent: "bg-safran text-encre hover:brightness-95",
    secondary: "bg-vert-doux text-vert-fonce hover:brightness-95",
  }[variant];
  return (
    <Link href={href} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-bouton px-5 text-base font-bold ${styles}`}>
      {children}
    </Link>
  );
}
