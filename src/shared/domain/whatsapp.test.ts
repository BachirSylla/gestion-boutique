import { describe, expect, it } from "vitest";
import { whatsAppLink } from "./whatsapp";

describe("whatsAppLink", () => {
  it("vise le numéro sans « + » et encode le texte", () => {
    expect(whatsAppLink("Bonjour Awa, 13 680 F", "+221776148991")).toBe("https://wa.me/221776148991?text=Bonjour%20Awa%2C%2013%20680%20F");
  });

  it("sans numéro, laisse choisir le contact", () => {
    expect(whatsAppLink("Salut")).toBe("https://wa.me/?text=Salut");
  });
});
