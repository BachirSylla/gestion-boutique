// Coquille préchargée : s'affiche immédiatement (y compris hors ligne) pendant le chargement des données.
export default function Loading() {
  return (
    <div className="min-h-dvh" aria-busy="true">
      <div className="h-17 bg-vert-principal" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-bordure" />
        <div className="h-4 w-40 animate-pulse rounded bg-bordure" />
        <div className="h-28 animate-pulse rounded-carte bg-surface" />
      </div>
    </div>
  );
}
