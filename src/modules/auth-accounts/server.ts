import "server-only";

// Interface publique côté serveur du module auth-accounts.
export { getCurrentAccount, requirePageAccount, authorizeAction, type CurrentAccount, type ShopSummary } from "./data/account";
export { signOutAction } from "./data/actions";
export { denyAccessRoute } from "./data/deny";
export { createLoginAccount, deleteLoginAccount, newTemporaryPassword, setLoginBanned, setLoginPassword } from "./data/auth-admin";
export { listTeam, getTeamMember, type TeamMember } from "./data/team";
export { listAccountEvents, type AccountEvent } from "./data/events";
export { createMemberAction, setMemberShopsAction, setMemberStatusAction, resetMemberPasswordAction } from "./data/team-actions";
export { changePasswordAction, firstPasswordAction } from "./data/password-actions";
