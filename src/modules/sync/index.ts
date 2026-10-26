// Interface publique du module sync (hors ligne et synchronisation).
export {
  classifyOutcome,
  isCustomerCommand,
  countedOperations,
  mergeOperations,
  pendingRequestTargets,
  rejectionMessage,
  summarizeByCustomer,
  syncState,
  type CustomerSummary,
  type OutboxCommand,
  type OutboxEntry,
  type TakeLinePayload,
  type ViewOperation,
} from "./domain/sync";
export type { LocalClosing, LocalCustomer, LocalLine, LocalMovement, LocalOperation, LocalPackage, LocalProduct, LocalRequest, LocalReview, LocalShop } from "./data/local-db";
export { SyncProvider, useOptionalSync, useSync, useSyncStatus, clearLocalData } from "./ui/SyncProvider";
export { SyncIndicator } from "./ui/SyncIndicator";
export { SignOutButton } from "./ui/SignOutButton";
export { useLocalLines, useLocalShop, useRejectedEntries, type LocalShopData } from "./ui/hooks";
export { SyncPanel } from "./ui/SyncPanel";
