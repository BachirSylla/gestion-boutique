import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can (matrice CLAUDE.md §4.2, jalon 2)", () => {
  it("l'admin plateforme gère les propriétaires, pas les boutiques au quotidien", () => {
    expect(can("platformAdmin", "managePlatform")).toBe(true);
    expect(can("platformAdmin", "manageTeam")).toBe(false);
    expect(can("platformAdmin", "workInShop")).toBe(false);
  });

  it("le propriétaire gère son équipe et ses boutiques", () => {
    expect(can("owner", "manageTeam")).toBe(true);
    expect(can("owner", "manageShops")).toBe(true);
    expect(can("owner", "managePlatform")).toBe(false);
  });

  it("gérant et comptable ne gèrent ni l'équipe ni les boutiques", () => {
    for (const role of ["manager", "accountant"] as const) {
      expect(can(role, "manageTeam")).toBe(false);
      expect(can(role, "manageShops")).toBe(false);
      expect(can(role, "workInShop")).toBe(true);
    }
  });

  it("sans rôle, aucune capacité", () => {
    expect(can(null, "workInShop")).toBe(false);
  });
});
