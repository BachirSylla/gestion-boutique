// Validation de la saisie de connexion et traduction des erreurs Supabase Auth en codes métier.
import { loginEmailFromPhone, normalizePhone, type PhoneCountry, SENEGAL } from "@/shared/domain";

export type LoginErrorCode =
  | "invalidPhone"
  | "passwordRequired"
  | "invalidCredentials"
  | "accountDisabled"
  | "tenantSuspended"
  | "noAccess"
  | "offline"
  | "tooManyAttempts"
  | "unexpected";

export type LoginInput =
  | { ok: true; phone: string; email: string; password: string }
  | { ok: false; field: "phone" | "password"; error: LoginErrorCode };

export function parseLoginInput(phoneInput: string, password: string, country: PhoneCountry = SENEGAL): LoginInput {
  const phone = normalizePhone(phoneInput, country);
  if (!phone) return { ok: false, field: "phone", error: "invalidPhone" };
  if (!password) return { ok: false, field: "password", error: "passwordRequired" };
  return { ok: true, phone, email: loginEmailFromPhone(phone), password };
}

/** Erreur renvoyée par supabase-js (AuthError) : on ne garde que ce qui sert à décider. */
export interface AuthErrorLike {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
}

export function loginErrorFromAuth(error: AuthErrorLike): LoginErrorCode {
  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return "invalidCredentials";
    case "user_banned":
      return "accountDisabled";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "tooManyAttempts";
  }
  if (error.status === 429) return "tooManyAttempts";
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return "offline";
  return "unexpected";
}
