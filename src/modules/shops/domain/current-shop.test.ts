import { describe, expect, it } from "vitest";
import { pickCurrentShopId } from "./current-shop";

describe("pickCurrentShopId", () => {
  it("garde la boutique choisie si elle est accessible", () => {
    expect(pickCurrentShopId(["a", "b"], "b")).toBe("b");
  });

  it("prend la première si le choix n'est plus accessible (rattachement retiré)", () => {
    expect(pickCurrentShopId(["a", "b"], "z")).toBe("a");
    expect(pickCurrentShopId(["a", "b"], null)).toBe("a");
  });

  it("aucune boutique : null", () => {
    expect(pickCurrentShopId([], "a")).toBeNull();
  });
});
