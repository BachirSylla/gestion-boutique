"use client";

import { Button } from "@/shared/ui";

export function RetryButton({ label }: { label: string }) {
  return (
    <Button variant="primary" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
