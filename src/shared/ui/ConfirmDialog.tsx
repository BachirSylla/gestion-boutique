"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

export interface ConfirmOptions {
  /** Question posée (ex. « Annuler cette opération ? »). */
  message: string;
  /** Libellé du bouton qui confirme : l'action elle-même, jamais « OK ». */
  confirmLabel: string;
  /** « danger » : action qui retire, annule ou désactive (bouton brique, « Retour » sélectionné par défaut). */
  tone?: "primary" | "danger";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Fenêtre de confirmation commune à toute l'application, à la place de window.confirm.
 * Élément <dialog> natif : focus piégé, touche Échap, fond assombri ; aucun réseau nécessaire.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const titleId = useId();

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  useEffect(() => {
    if (options && ref.current && !ref.current.open) ref.current.showModal();
  }, [options]);

  const close = (value: boolean) => {
    ref.current?.close();
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };
  const danger = options?.tone === "danger";

  return (
    <ConfirmContext value={confirm}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close(false);
        }}
        onClick={(event) => {
          // Toucher le fond assombri referme sans confirmer.
          if (event.target === ref.current) close(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-carte bg-surface p-0 text-encre shadow-xl backdrop:bg-encre/50"
      >
        {options ? (
          <div className="p-6">
            <p id={titleId} className="text-lg leading-snug font-bold">
              {options.message}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" autoFocus={danger} onClick={() => close(false)}>
                {t("back")}
              </Button>
              <Button
                variant="primary"
                autoFocus={!danger}
                className={danger ? "bg-brique hover:bg-brique hover:brightness-110" : ""}
                onClick={() => close(true)}
                data-testid="confirm-dialog-ok"
              >
                {options.confirmLabel}
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </ConfirmContext>
  );
}

/** Demande une confirmation ; hors fournisseur (tests isolés), repli sur la boîte du navigateur. */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext) ?? (async (o) => window.confirm(o.message));
}
