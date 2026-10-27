"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button, useConfirm } from "@/shared/ui";
import { clearLocalData, useSyncStatus } from "./SyncProvider";

/**
 * Déconnexion : efface d'abord les données de l'appareil (base locale, pages en cache).
 * S'il reste des saisies non envoyées, on prévient : elles seraient perdues.
 */
export function SignOutButton({ action, userId, className = "", variant = "ghost" }: { action: () => Promise<void>; userId: string; className?: string; variant?: "ghost" | "secondary" }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const status = useSyncStatus();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form ref={formRef} action={action}>
      <Button
        type="button"
        variant={variant}
        block
        disabled={busy}
        className={className}
        onClick={async () => {
          if (status.pending > 0 && !(await confirm({ message: t("sync.signOutPending", { count: status.pending }), confirmLabel: t("auth.signOut"), tone: "danger" }))) return;
          setBusy(true);
          await clearLocalData(userId).catch(() => undefined);
          formRef.current?.requestSubmit();
        }}
      >
        {t("auth.signOut")}
      </Button>
    </form>
  );
}
