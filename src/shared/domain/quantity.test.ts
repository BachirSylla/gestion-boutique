import { describe, expect, it } from "vitest";
import { formatQuantity, parseQuantity } from "./quantity";

describe("parseQuantity", () => {
  it("convertit une saisie décimale en millièmes", () => {
    expect(parseQuantity("0,5")).toBe(500);
    expect(parseQuantity("1.25")).toBe(1250);
    expect(parseQuantity("2")).toBe(2000);
    expect(parseQuantity(" 50 ")).toBe(50000);
    expect(parseQuantity("0,125")).toBe(125);
  });

  it("refuse les saisies invalides ou trop précises", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("0,1234")).toBeNull();
    expect(parseQuantity("1,2,3")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("affiche en notation française sans zéros inutiles", () => {
    expect(formatQuantity(500)).toBe("0,5");
    expect(formatQuantity(1250)).toBe("1,25");
    expect(formatQuantity(50000)).toBe("50");
    expect(formatQuantity(125)).toBe("0,125");
    expect(formatQuantity(-500)).toBe("−0,5");
  });
});
