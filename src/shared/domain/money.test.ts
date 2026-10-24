import { describe, expect, it } from "vitest";
import { divideRoundHalfUp, formatAmount, lineAmount, sumAmounts } from "./money";

describe("divideRoundHalfUp", () => {
  it("arrondit au plus proche, la moitié vers le haut", () => {
    expect(divideRoundHalfUp(7n, 2n)).toBe(4n); // 3,5 → 4
    expect(divideRoundHalfUp(5n, 4n)).toBe(1n); // 1,25 → 1
    expect(divideRoundHalfUp(7n, 4n)).toBe(2n); // 1,75 → 2
    expect(divideRoundHalfUp(-7n, 2n)).toBe(-3n); // −3,5 → −3 (vers +∞)
    expect(divideRoundHalfUp(-5n, 4n)).toBe(-1n);
    expect(divideRoundHalfUp(0n, 3n)).toBe(0n);
  });
});

describe("lineAmount (RG3, quantité libre)", () => {
  it("0,25 kg × 315 F = 78,75 F → 80 F au pas de 5 F", () => {
    expect(lineAmount(250, 315, 5)).toBe(80);
  });

  it("applique le pas de la boutique : 1, 5 ou 25 F", () => {
    expect(lineAmount(250, 315, 1)).toBe(79); // 78,75 → 79
    expect(lineAmount(250, 315, 25)).toBe(75); // 78,75 → 75 (plus proche de 75 que de 100)
  });

  it("la moitié va vers le haut", () => {
    expect(lineAmount(500, 315, 1)).toBe(158); // 157,5 → 158
    expect(lineAmount(500, 315, 5)).toBe(160); // 157,5 → 160 (155 ↔ 160, 157,5 est la moitié)
    expect(lineAmount(1500, 25, 25)).toBe(50); // 37,5 → 50
  });

  it("quantité entière : pas d'arrondi si le montant tombe juste", () => {
    expect(lineAmount(1000, 315, 5)).toBe(315);
    expect(lineAmount(5000, 315, 5)).toBe(1575);
    expect(lineAmount(2000, 1100, 25)).toBe(2200);
  });

  it("refuse un prix non entier ou un pas inconnu", () => {
    expect(() => lineAmount(1000, 31.5, 5)).toThrow(RangeError);
    // @ts-expect-error pas non autorisé
    expect(() => lineAmount(1000, 315, 10)).toThrow(RangeError);
  });

  it("le total d'une prise est la somme des lignes déjà arrondies", () => {
    const lines = [lineAmount(250, 315, 5), lineAmount(250, 315, 5)];
    expect(sumAmounts(lines)).toBe(160); // et non arrondi(157,5) = 160 par coïncidence
    const lines1 = [lineAmount(250, 315, 1), lineAmount(250, 315, 1)];
    expect(sumAmounts(lines1)).toBe(158); // 79 + 79, et non arrondi(157,5) = 158
    expect(sumAmounts([lineAmount(330, 315, 1), lineAmount(330, 315, 1)])).toBe(208); // 104 + 104 (103,95 ×2 = 207,9)
  });
});

describe("formatAmount", () => {
  it("sépare les milliers par une espace insécable", () => {
    expect(formatAmount(13680)).toBe("13 680 F");
    expect(formatAmount(1350)).toBe("1 350 F");
    expect(formatAmount(315)).toBe("315 F");
    expect(formatAmount(0)).toBe("0 F");
    expect(formatAmount(1234567)).toBe("1 234 567 F");
  });

  it("affiche le signe moins, et le plus sur demande", () => {
    expect(formatAmount(-2205)).toBe("−2 205 F");
    expect(formatAmount(2205, { signDisplay: "always" })).toBe("+2 205 F");
    expect(formatAmount(0, { signDisplay: "always" })).toBe("0 F");
  });

  it("refuse un montant à virgule", () => {
    expect(() => formatAmount(10.5)).toThrow(RangeError);
  });
});
