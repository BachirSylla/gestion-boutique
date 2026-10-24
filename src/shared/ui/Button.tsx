import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-vert-principal text-white hover:bg-vert-fonce disabled:bg-vert-principal/60",
  accent: "bg-safran text-encre hover:brightness-95 disabled:opacity-60",
  secondary: "bg-vert-doux text-vert-fonce hover:brightness-95 disabled:opacity-60",
  ghost: "bg-transparent text-vert-fonce hover:bg-vert-doux disabled:opacity-60",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

/** Bouton : zone tactile ≥ 48 px, texte en gras. */
export function Button({ variant = "primary", block = false, className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-bouton px-5 text-base font-bold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
