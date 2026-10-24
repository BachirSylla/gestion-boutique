// Capacités par rôle (CLAUDE.md §4.2), pour l'interface. La base reste la vraie barrière.
import type { AppRole } from "./access";

export type AccountRole = AppRole | "platformAdmin";

export type Capability =
  | "managePlatform" // propriétaires et leurs boutiques
  | "manageTeam" // gérants et comptables
  | "manageShops" // créer, modifier ses boutiques
  | "workInShop"; // saisies du quotidien dans une boutique

const CAPABILITIES: Record<AccountRole, readonly Capability[]> = {
  platformAdmin: ["managePlatform"],
  owner: ["manageTeam", "manageShops", "workInShop"],
  manager: ["workInShop"],
  accountant: ["workInShop"],
};

export function can(role: AccountRole | null, capability: Capability): boolean {
  return role !== null && CAPABILITIES[role].includes(capability);
}

/** Rôles qu'un propriétaire peut attribuer à ses employés. */
export const MEMBER_ROLES = ["manager", "accountant"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
