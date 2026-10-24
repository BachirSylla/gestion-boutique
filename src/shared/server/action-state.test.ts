import { describe, expect, it } from "vitest";
import { errorFromDatabase } from "./action-state";

describe("errorFromDatabase", () => {
  it("traduit les erreurs Postgres utiles", () => {
    expect(errorFromDatabase({ code: "42501", message: "Seul le propriétaire…" })).toBe("forbidden");
    expect(errorFromDatabase({ code: "23505", message: 'duplicate key value violates unique constraint "profile_contacts_phone_e164_key"' })).toBe(
      "phoneTaken",
    );
    expect(errorFromDatabase({ code: "23505", message: "autre contrainte" })).toBe("invalidInput");
    expect(errorFromDatabase({ code: "23514" })).toBe("invalidInput");
    expect(errorFromDatabase({ code: "P0002" })).toBe("notFound");
    expect(errorFromDatabase({ code: "XX000" })).toBe("unexpected");
  });
});
