import { describe, expect, it } from "vitest";
import { loginErrorFromAuth, parseLoginInput } from "./credentials";

describe("parseLoginInput", () => {
  it("accepte un numéro sous toutes ses formes et dérive l'identifiant interne", () => {
    expect(parseLoginInput("77 614 89 91", "secret")).toEqual({
      ok: true,
      phone: "+221776148991",
      email: "221776148991@phone.bitig.invalid",
      password: "secret",
    });
    expect(parseLoginInput("+221 77 614 89 91", "x")).toMatchObject({ ok: true, phone: "+221776148991" });
  });

  it("signale un numéro invalide sur le champ téléphone", () => {
    expect(parseLoginInput("12345", "secret")).toEqual({ ok: false, field: "phone", error: "invalidPhone" });
  });

  it("exige un mot de passe", () => {
    expect(parseLoginInput("776148991", "")).toEqual({ ok: false, field: "password", error: "passwordRequired" });
  });
});

describe("loginErrorFromAuth", () => {
  it("traduit les erreurs Supabase Auth", () => {
    expect(loginErrorFromAuth({ code: "invalid_credentials", status: 400 })).toBe("invalidCredentials");
    expect(loginErrorFromAuth({ code: "user_banned", status: 400 })).toBe("accountDisabled");
    expect(loginErrorFromAuth({ code: "over_request_rate_limit", status: 429 })).toBe("tooManyAttempts");
    expect(loginErrorFromAuth({ status: 429 })).toBe("tooManyAttempts");
    expect(loginErrorFromAuth({ name: "AuthRetryableFetchError", status: 0 })).toBe("offline");
    expect(loginErrorFromAuth({ status: 500, message: "boom" })).toBe("unexpected");
  });
});
