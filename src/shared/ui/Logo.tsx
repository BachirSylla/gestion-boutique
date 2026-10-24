/** Logo Bitig : carnet safran à reliure verte. Décoratif (le nom est écrit à côté). */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="12" fill="var(--safran)" />
      <rect x="11" y="11" width="5" height="26" rx="2.5" fill="var(--vert-principal)" />
      <path d="M21 17h15M21 24h15M21 31h9" stroke="var(--vert-principal)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
