// Interface publique du module auth-accounts (utilisable côté client et serveur).
export { LoginForm } from "./ui/LoginForm";
export { decideAccess, type AccessDecision, type AppRole } from "./domain/access";
export { parseLoginInput, loginErrorFromAuth, type LoginErrorCode } from "./domain/credentials";
export { can, MEMBER_ROLES, type AccountRole, type Capability, type MemberRole } from "./domain/permissions";
export { PASSWORD_MIN_LENGTH } from "./domain/password";
export type { IssuedCredentials } from "./domain/credentials-share";
export { CredentialsCard } from "./ui/CredentialsCard";
export { PasswordForm } from "./ui/PasswordForm";
export { AccountActionButton } from "./ui/AccountActionButton";
export { CreateMemberForm, MemberShopsForm, type ShopOption } from "./ui/MemberForms";
