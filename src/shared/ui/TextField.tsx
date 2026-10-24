import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | null;
  /** Élément à gauche dans le champ (ex. indicatif « +221 »). */
  leading?: ReactNode;
  /** Élément à droite dans le champ (ex. bouton « afficher »). */
  trailing?: ReactNode;
}

export function TextField({ label, error, leading, trailing, className = "", ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-encre">
        {label}
      </label>
      <div
        className={`flex min-h-13 items-center rounded-bouton border bg-surface focus-within:border-vert-principal focus-within:ring-2 focus-within:ring-vert-principal/20 ${
          error ? "border-brique" : "border-bordure-champ"
        }`}
      >
        {leading ? <span className="montant pl-4 text-base font-semibold text-gris-texte">{leading}</span> : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="montant h-13 w-full min-w-0 flex-1 rounded-bouton bg-transparent px-4 text-lg text-encre outline-none placeholder:text-gris-texte/70"
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-brique">
          {error}
        </p>
      ) : null}
    </div>
  );
}
