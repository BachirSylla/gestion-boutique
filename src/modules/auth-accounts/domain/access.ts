// Qui est connecté, et a-t-il le droit d'entrer ? (la RLS reste la vraie barrière)

export type AppRole = "owner" | "manager" | "accountant";

export interface ProfileFacts {
  role: AppRole;
  status: "active" | "disabled";
  tenantStatus: "active" | "suspended";
  shopCount: number;
}

export type AccessDecision =
  | { allowed: true; kind: "platformAdmin" }
  | { allowed: true; kind: "member"; role: AppRole }
  | { allowed: false; reason: "accountDisabled" | "tenantSuspended" | "noAccess" };

/**
 * Décide de l'accès à l'application après connexion.
 * - L'admin plateforme entre toujours (il n'a pas de propriétaire).
 * - Un profil désactivé ou un propriétaire suspendu n'entre pas.
 * - Un gérant ou comptable sans aucune boutique rattachée n'a rien à faire dans l'application.
 *   Le propriétaire entre même sans boutique (il pourra en créer une).
 */
export function decideAccess(facts: { isPlatformAdmin: boolean; profile: ProfileFacts | null }): AccessDecision {
  if (facts.isPlatformAdmin) return { allowed: true, kind: "platformAdmin" };
  const { profile } = facts;
  if (!profile) return { allowed: false, reason: "noAccess" };
  if (profile.status !== "active") return { allowed: false, reason: "accountDisabled" };
  if (profile.tenantStatus !== "active") return { allowed: false, reason: "tenantSuspended" };
  if (profile.role !== "owner" && profile.shopCount === 0) return { allowed: false, reason: "noAccess" };
  return { allowed: true, kind: "member", role: profile.role };
}
