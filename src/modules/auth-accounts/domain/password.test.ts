import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("exige 8 caractères au moins", () => {
    expect(validateNewPassword("1234567", "1234567")).toBe("passwordTooShort");
    expect(validateNewPassword("12345678", "12345678")).toBeNull();
  });

  it("refuse plus de 72 caractères", () => {
    const long = "a".repeat(73);
    expect(validateNewPassword(long, long)).toBe("passwordTooLong");
  });

  it("exige une confirmation identique", () => {
    expect(validateNewPassword("bonjour123", "bonjour124")).toBe("passwordMismatch");
  });

  it("refuse de garder le même mot de passe", () => {
    expect(validateNewPassword("bonjour123", "bonjour123", { current: "bonjour123" })).toBe("passwordUnchanged");
    expect(validateNewPassword("bonjour123", "bonjour123", { current: "autre-chose" })).toBeNull();
  });
});

describe("generateTemporaryPassword", () => {
  it("produit le format lettres-chiffres-lettres sans caractère ambigu", () => {
    let seed = 0;
    const sequence = (max: number) => seed++ % max;
    const password = generateTemporaryPassword(sequence);
    expect(password).toMatch(/^[a-km-np-z]{4}-[2-9]{4}-[a-km-np-z]{4}$/);
    expect(password).not.toMatch(/[01lIoO]/);
  });

  it("respecte la longueur minimale", () => {
    expect(generateTemporaryPassword(() => 0).length).toBeGreaterThanOrEqual(8);
  });

  it("dépend du hasard fourni", () => {
    expect(generateTemporaryPassword(() => 0)).toBe("aaaa-2222-aaaa");
    expect(generateTemporaryPassword((max) => max - 1)).toBe("zzzz-9999-zzzz");
  });
});
