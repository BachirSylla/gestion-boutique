"use client";

import { useId, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

/** Bouton d'envoi qui se désactive pendant l'envoi du formulaire parent. */
export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

/** Groupe de cases à cocher (plusieurs choix) ou de boutons radio (un choix), en grosses cartes tactiles. */
export function ChoiceGroup({
  legend,
  name,
  options,
  type,
  defaultValues = [],
  hint,
  error,
}: {
  legend: string;
  name: string;
  options: ChoiceOption[];
  type: "checkbox" | "radio";
  defaultValues?: string[];
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-encre">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mb-2 text-sm text-gris-texte">
          {hint}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-13 cursor-pointer items-start gap-3 rounded-bouton border border-bordure-champ bg-surface px-4 py-3 has-checked:border-vert-principal has-checked:bg-vert-doux"
          >
            <input
              type={type}
              name={name}
              value={option.value}
              defaultChecked={defaultValues.includes(option.value)}
              className="mt-0.5 size-5 shrink-0 accent-vert-principal"
            />
            <span>
              <span className="block font-semibold text-encre">{option.label}</span>
              {option.hint ? <span className="block text-sm text-gris-texte">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-brique">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-encre">{title}</h2>
        {hint ? <p className="text-sm text-gris-texte">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
