// Interface publique du module auth-accounts (utilisable côté client et serveur).
export { LoginForm } from "./ui/LoginForm";
export { decideAccess, type AccessDecision, type AppRole } from "./domain/access";
export { parseLoginInput, loginErrorFromAuth, type LoginErrorCode } from "./domain/credentials";
