import { describe, expect, it } from "vitest";
import { defaultPolicy, formatLine, formatPriceFromRetail, proposeFormatPrices, REMAINING_ESTIMATES, validateGrid } from "./catalog";

describe("defaultPolicy (RG4)", () => {
  const settings = { hike: "after_sellout" as const, drop: "immediate" as const }; // réglage du premier client
  it("hausse après écoulement, baisse immédiate", () => {
    expect(defaultPolicy(315, 330, settings)).toBe("after_sellout");
    expect(defaultPolicy(330, 315, settings)).toBe("immediate");
    expect(defaultPolicy(315, 315, settings)).toBe("immediate");
  });
});

describe("proposeFormatPrices", () => {
  const formats = [
    { label: "½ kg", quantityMilli: 500, price: 160 },
    { label: "1 kg", quantityMilli: 1000, price: 315 },
  ];
  it("garde l'écart choisi par le boutiquier et arrondit au pas", () => {
    expect(proposeFormatPrices(formats, 315, 330, 5).map((f) => f.price)).toEqual([170, 330]); // 167,6 → 170
    expect(proposeFormatPrices(formats, 315, 330, 1).map((f) => f.price)).toEqual([168, 330]);
    const afterHike = [
      { label: "½ kg", quantityMilli: 500, price: 170 },
      { label: "1 kg", quantityMilli: 1000, price: 330 },
    ];
    expect(proposeFormatPrices(afterHike, 330, 315, 5).map((f) => f.price)).toEqual([160, 315]); // 162,3 → 160
  });
});

describe("formatPriceFromRetail", () => {
  it("quantité × prix de détail, arrondi au pas", () => {
    expect(formatPriceFromRetail(500, 315, 5)).toBe(160); // 157,5 → 160
    expect(formatPriceFromRetail(250, 1100, 5)).toBe(275);
  });
});

describe("validateGrid", () => {
  it("exige des prix entiers > 0 et des formats complets", () => {
    expect(validateGrid({ retailPrice: 315, packagePrice: 15000, formats: [{ label: "½ kg", quantityMilli: 500, price: 160 }] })).toBeNull();
    expect(validateGrid({ retailPrice: 0, packagePrice: null, formats: [] })).toBe("retailPriceInvalid");
    expect(validateGrid({ retailPrice: 315, packagePrice: 0, formats: [] })).toBe("packagePriceInvalid");
    expect(validateGrid({ retailPrice: 315, packagePrice: null, formats: [{ label: " ", quantityMilli: 500, price: 160 }] })).toBe("formatInvalid");
  });
});

describe("formatLine (RG3)", () => {
  it("nombre × prix du format, sans arrondi ; quantité totale en millièmes", () => {
    const line = formatLine({ id: "riz", name: "Riz brisé", saleUnit: "kg" }, { label: "½ kg", quantityMilli: 500, price: 160 }, 3);
    expect(line).toEqual({
      label: "Riz brisé ½ kg",
      productId: "riz",
      quantity: 1500,
      unit: "kg",
      unitPrice: 160,
      formatLabel: "½ kg",
      formatCount: 3,
      lineAmount: 480,
    });
  });
});

describe("REMAINING_ESTIMATES", () => {
  it("presque vide = 10 % (validé avec le propriétaire du produit)", () => {
    expect(REMAINING_ESTIMATES).toEqual({ full: 1000, threeQuarters: 750, half: 500, quarter: 250, almostEmpty: 100 });
  });
});
