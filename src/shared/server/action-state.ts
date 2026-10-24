// État renvoyé par les Server Actions aux formulaires (useActionState).
// Les codes d'erreur sont traduits par l'interface (messages « errors.* »).

export type ActionErrorCode =
  | "forbidden"
  | "phoneTaken"
  | "invalidPhone"
  | "nameRequired"
  | "shopRequired"
  | "roleRequired"
  | "invalidInput"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "passwordUnchanged"
  | "currentPasswordWrong"
  | "notFound"
  | "amountRequired"
  | "lineInvalid"
  | "paymentMethodRequired"
  | "reasonRequired"
  | "cancelNeedsRequest"
  | "alreadyCancelled"
  | "customerArchived"
  | "requestPending"
  | "noShop"
  | "typeRequired"
  | "invalidAmount"
  | "invalidDueDay"
  | "unexpected";

export type ActionState<T = null> =
  | { status: "idle" }
  | { status: "success"; data: T }
  | { status: "error"; error: ActionErrorCode; fields?: Partial<Record<string, ActionErrorCode>> };

export const IDLE: ActionState<never> = { status: "idle" };

export function success<T>(data: T): ActionState<T> {
  return { status: "success", data };
}

export function failure(error: ActionErrorCode, fields?: Partial<Record<string, ActionErrorCode>>): ActionState<never> {
  return { status: "error", error, fields };
}

/** Traduit une erreur Postgres / PostgREST en code d'erreur métier. */
export function errorFromDatabase(error: { code?: string; message?: string }): ActionErrorCode {
  switch (error.code) {
    case "42501":
      return "forbidden";
    case "23505":
      return error.message?.includes("phone") ? "phoneTaken" : "invalidInput";
    case "23514":
    case "22P02":
      return "invalidInput";
    case "P0002":
      return "notFound";
    // Codes métier du journal (migration 20261024050000).
    case "BT001":
      return "cancelNeedsRequest";
    case "BT002":
      return "alreadyCancelled";
    case "BT003":
      return "customerArchived";
    case "BT004":
      return "invalidInput";
    case "BT006":
      return "requestPending";
  }
  return "unexpected";
}
