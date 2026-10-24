import { describe, expect, it } from "vitest";
import { formatPhone, loginEmailFromPhone, normalizePhone } from "./phone";

describe("normalizePhone (Sénégal)", () => {
  it.each([
    "77 614 89 91",
    "776148991",
    "+221 77 614 89 91",
    "+221776148991",
    "00221776148991",
    "221776148991",
    "77.614.89.91",
    "77-614-89-91",
  ])("%s → +221776148991", (input) => {
    expect(normalizePhone(input)).toBe("+221776148991");
  });

  it("accepte les préfixes mobiles et fixes", () => {
    for (const prefix of ["70", "75", "76", "77", "78", "33"]) {
      expect(normalizePhone(`${prefix}1234567`)).toBe(`+221${prefix}1234567`);
    }
  });

  it.each(["", "abc", "7761489", "7761489912", "99 123 45 67", "+33 6 12 34 56 78", "0033612345678", "77 614 89 9a"])(
    "refuse %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("formatPhone", () => {
  it("groupe les chiffres", () => {
    expect(formatPhone("+221776148991")).toBe("+221 77 614 89 91");
  });
});

describe("loginEmailFromPhone", () => {
  it("dérive un identifiant interne non routable", () => {
    expect(loginEmailFromPhone("+221776148991")).toBe("221776148991@phone.bitig.invalid");
  });

  it("exige un numéro E.164", () => {
    expect(() => loginEmailFromPhone("776148991")).toThrow(RangeError);
  });
});
