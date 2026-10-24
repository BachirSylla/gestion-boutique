import { describe, expect, it } from "vitest";
import { decideAccess, type ProfileFacts } from "./access";

const active: ProfileFacts = { role: "manager", status: "active", tenantStatus: "active", shopCount: 1 };

describe("decideAccess", () => {
  it("laisse entrer l'admin plateforme", () => {
    expect(decideAccess({ isPlatformAdmin: true, profile: null })).toEqual({ allowed: true, kind: "platformAdmin" });
  });

  it("laisse entrer un membre actif rattaché", () => {
    expect(decideAccess({ isPlatformAdmin: false, profile: active })).toEqual({ allowed: true, kind: "member", role: "manager" });
  });

  it("refuse un compte sans profil", () => {
    expect(decideAccess({ isPlatformAdmin: false, profile: null })).toEqual({ allowed: false, reason: "noAccess" });
  });

  it("refuse un compte désactivé, même rattaché", () => {
    expect(decideAccess({ isPlatformAdmin: false, profile: { ...active, status: "disabled" } })).toEqual({
      allowed: false,
      reason: "accountDisabled",
    });
  });

  it("refuse les membres d'un propriétaire suspendu", () => {
    expect(decideAccess({ isPlatformAdmin: false, profile: { ...active, role: "owner", tenantStatus: "suspended" } })).toEqual({
      allowed: false,
      reason: "tenantSuspended",
    });
  });

  it("refuse un gérant ou comptable sans boutique, pas le propriétaire", () => {
    expect(decideAccess({ isPlatformAdmin: false, profile: { ...active, shopCount: 0 } })).toEqual({ allowed: false, reason: "noAccess" });
    expect(decideAccess({ isPlatformAdmin: false, profile: { ...active, role: "accountant", shopCount: 0 } })).toMatchObject({
      allowed: false,
    });
    expect(decideAccess({ isPlatformAdmin: false, profile: { ...active, role: "owner", shopCount: 0 } })).toEqual({
      allowed: true,
      kind: "member",
      role: "owner",
    });
  });
});
