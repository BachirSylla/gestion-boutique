import { describe, expect, it } from "vitest";
import { daysBetween, lastDueDate, localDate } from "./calendar";

describe("localDate", () => {
  it("donne la date dans le fuseau de la boutique", () => {
    expect(localDate("2026-10-23T23:30:00Z", "Africa/Dakar")).toBe("2026-10-23");
    expect(localDate("2026-10-23T23:30:00Z", "Africa/Lagos")).toBe("2026-10-24"); // UTC+1
  });
});

describe("daysBetween", () => {
  it("compte les jours calendaires", () => {
    expect(daysBetween("2026-09-23", "2026-10-23")).toBe(30);
    expect(daysBetween("2026-10-23", "2026-10-23")).toBe(0);
  });
});

describe("lastDueDate", () => {
  it("fin de mois : le dernier jour du mois précédent, ou aujourd'hui si c'est le dernier jour", () => {
    expect(lastDueDate("2026-10-23", null)).toBe("2026-09-30");
    expect(lastDueDate("2026-10-31", null)).toBe("2026-10-31");
    expect(lastDueDate("2026-03-05", null)).toBe("2026-02-28");
    expect(lastDueDate("2028-03-05", null)).toBe("2028-02-29"); // année bissextile
    expect(lastDueDate("2026-01-10", null)).toBe("2025-12-31");
  });

  it("jour réglé : ce mois-ci s'il est atteint, sinon le mois précédent", () => {
    expect(lastDueDate("2026-10-23", 5)).toBe("2026-10-05");
    expect(lastDueDate("2026-10-05", 5)).toBe("2026-10-05");
    expect(lastDueDate("2026-10-04", 5)).toBe("2026-09-05");
    expect(lastDueDate("2026-01-04", 5)).toBe("2025-12-05");
  });
});
