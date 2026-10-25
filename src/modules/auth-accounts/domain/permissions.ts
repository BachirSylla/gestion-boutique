// Capacités par rôle (CLAUDE.md §4.2), pour l'interface. La base reste la vraie barrière.
import type { AppRole } from "./access";

export type AccountRole = AppRole | "platformAdmin";

export type Capability =
  | "managePlatform" // propriétaires et leurs boutiques
  | "manageTeam" // gérants et comptables
  | "manageShops" // créer, modifier ses boutiques
  | "workInShop" // travailler dans une boutique (lecture au moins)
  | "viewCustomers" // consulter clients, soldes, historique
  | "manageCustomers" // créer, modifier, archiver un client
  | "recordOperations" // prises, versements, annulations, demandes
  | "decideCancellations" // valider / refuser une demande d'annulation
  | "manageSettings" // réglages de la boutique
  | "manageCatalog"; // produits, prix et politique de prix

const CAPABILITIES: Record<AccountRole, readonly Capability[]> = {
  platformAdmin: ["managePlatform"],
  owner: ["manageTeam", "manageShops", "workInShop", "viewCustomers", "manageCustomers", "recordOperations", "decideCancellations", "manageSettings", "manageCatalog"],
  manager: ["workInShop", "viewCustomers", "manageCustomers", "recordOperations"],
  accountant: ["workInShop", "viewCustomers"],
};

export function can(role: AccountRole | null, capability: Capability): boolean {
  return role !== null && CAPABILITIES[role].includes(capability);
}

/** Rôles qu'un propriétaire peut attribuer à ses employés. */
export const MEMBER_ROLES = ["manager", "accountant"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
