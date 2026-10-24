import "server-only";

// Interface publique côté serveur du module auth-accounts.
export { getCurrentAccount, type CurrentAccount, type ShopSummary } from "./data/account";
export { signOutAction } from "./data/actions";
export { denyAccessRoute } from "./data/deny";
