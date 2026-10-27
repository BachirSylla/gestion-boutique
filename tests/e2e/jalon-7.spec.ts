import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFixture } from "./fixtures";

const NBSP = " ";
const F = (text: string) => text.replace(/ /g, NBSP);
const WIDTHS = [
  { name: "360", width: 360, height: 780 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;

async function shoot(page: Page, name: string) {
  for (const { name: w, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} à ${w} px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `docs/captures/jalon-7/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function session(browser: Browser, phoneInput: string, password: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-SN", timezoneId: "Africa/Dakar" });
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/login");
  await page.getByLabel("Numéro de téléphone").fill(phoneInput);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
  return { context, page };
}

const synced = (page: Page) => expect(page.getByTestId("sync-indicator").first()).toHaveAttribute("data-state", "synced");
const card = (page: Page, name: string) => page.locator("article").filter({ has: page.getByText(name, { exact: true }) });

test("caisse et tableau de bord : clôture hors ligne, correction, ventes du jour, bénéfice brut", async ({ browser }) => {
  test.setTimeout(400_000);
  const { owner, manager } = readFixture();
  const o = await session(browser, owner.phoneInput, owner.password);
  const page = o.page;
  // « Boutique Fass » n'est utilisée par aucun autre parcours : montants exacts.
  await page.getByLabel("Changer de boutique").filter({ visible: true }).first().selectOption({ label: "Boutique Fass" });
  await expect(page.getByText("Vous travaillez sur : Boutique Fass")).toBeVisible();
  await expect(page.getByTestId("day-sales-total")).toHaveText(F("0 F"));
  await expect(page.getByTestId("month-profit")).toContainText(F("0 F"));

  // 1. Un produit : sac de sucre 50 kg, 600 F/kg, 30 000 F le sac entier ; 3 sacs reçus à 28 000 F.
  await page.goto("/catalog/new");
  await page.getByLabel("Nom du produit").fill("Sucre du jalon 7");
  await page.getByLabel("Contenance du conditionnement (kg)").fill("50");
  await page.getByLabel("Prix de détail par kg").fill("600");
  await page.getByLabel("Prix du conditionnement entier (facultatif)").fill("30000");
  await page.getByRole("button", { name: "Créer le produit" }).click();
  await expect(page.getByRole("heading", { name: "Sucre du jalon 7" })).toBeVisible();

  await page.goto("/stock");
  await synced(page);
  await card(page, "Sucre du jalon 7").getByRole("link", { name: /Sucre du jalon 7/ }).click();
  await page.getByRole("link", { name: "Réception" }).click();
  await page.getByLabel("Nombre de sacs").fill("3");
  await page.getByLabel("Prix d'achat par sac").fill("28000");
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.getByText("3 sacs fermés")).toBeVisible();
  // Un sac ouvert puis terminé : bilan 50 × 600 = 30 000 F, marge 2 000 F.
  await page.getByRole("button", { name: "Ouvrir" }).click();
  await synced(page);
  await page.getByRole("button", { name: "Terminé" }).click();
  await expect(page.getByRole("dialog")).toContainText("Sucre du jalon 7");
  await page.screenshot({ path: "docs/captures/pilote/confirmation-390.png" });
  await page.getByTestId("confirm-dialog-ok").click();
  await synced(page);
  // Un sac vendu entier au comptant 30 000 F : marge 2 000 F.
  await page.getByRole("link", { name: "Vendre entier" }).click();
  await page.getByRole("button", { name: "Enregistrer la vente" }).click();
  await expect(page.getByText("1 sac fermé")).toBeVisible();
  await synced(page);

  // 2. Journal client : prise de 13 680 F, versement Wave de 5 000 F.
  await page.goto("/customers");
  await page.getByRole("link", { name: "Nouveau client" }).click();
  await page.getByLabel("Nom du client").fill("Awa Ndiaye");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("13680");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(page.getByText("Prise enregistrée.")).toBeVisible();
  await page.getByRole("link", { name: "Versement" }).click();
  await page.getByLabel("Montant").fill("5000");
  await page.getByLabel("Wave").check();
  await page.getByRole("button", { name: /Enregistrer le versement/ }).click();
  await expect(page.getByText("Versement enregistré.")).toBeVisible();
  await synced(page);

  // 3. Caisse sans clôture : estimation marquée comme telle.
  await page.goto("/cash");
  await synced(page);
  await expect(page.getByText("Estimation").first()).toBeVisible();
  await expect(page.getByTestId("cash-day-total")).toContainText("≈");

  // 4. Clôture hors ligne : 60 000 F en espèces + 5 000 F Wave reçus → 65 000 − 5 000 − 30 000 = 30 000 F au détail.
  await o.context.setOffline(true);
  await page.getByLabel("Espèces").fill("60000");
  await page.getByLabel("Wave", { exact: true }).fill("5000");
  await expect(page.getByText(F("Dont versements de clients : 5 000 F"))).toBeVisible();
  await expect(page.getByTestId("closing-counter-cash")).toHaveText(F("30 000 F"));
  await page.getByRole("button", { name: "Enregistrer la clôture" }).click();
  await expect(page.getByText("Clôture enregistrée.")).toBeVisible();
  // Ventes du jour = 13 680 + 30 000 (sac entier) + 30 000 (détail) = 73 680 F.
  await expect(page.getByTestId("cash-day-total")).toHaveText(F("73 680 F"));
  await expect(page.getByText("Clôture faite").first()).toBeVisible();
  await expect(page.getByText("En attente d'envoi")).toBeVisible();
  await o.context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await synced(page);
  await expect(page.getByText("En attente d'envoi")).toHaveCount(0);

  // 5. Correction : une nouvelle clôture du même jour fait foi, l'historique reste.
  await page.reload();
  await synced(page);
  await expect(page.getByText(/Une clôture existe déjà ce jour-là/)).toBeVisible();
  await page.getByLabel("Espèces").fill("61000");
  await expect(page.getByTestId("closing-counter-cash")).toHaveText(F("31 000 F"));
  await page.getByRole("button", { name: "Enregistrer la clôture" }).click();
  await expect(page.getByTestId("cash-day-total")).toHaveText(F("74 680 F"));
  await synced(page);
  await expect(page.getByText("Corrigée")).toBeVisible();
  await shoot(page, "caisse");

  // 6. Bénéfices : 2 000 (sac terminé) + 2 000 (sac entier) = 4 000 F ; argent encaissé = 66 000 F déclarés.
  await page.goto("/profits");
  await expect(page.getByTestId("gross-profit")).toHaveText(F("4 000 F"));
  await expect(page.getByTestId("cash-collected")).toHaveText(F("66 000 F"));
  const row = page.getByRole("row", { name: /Sucre du jalon 7/ });
  await expect(row).toContainText(F("4 000 F"));
  await expect(page.getByText(F("13 680 F"))).toBeVisible(); // prises à compte : du bénéfice avant l'argent
  await shoot(page, "benefices");

  // 7. Tableau de bord : ventes du jour, bénéfice du mois, stock à surveiller, dernières opérations.
  await page.goto("/");
  await expect(page.getByTestId("day-sales-total")).toHaveText(F("74 680 F"));
  await expect(page.getByTestId("month-profit")).toContainText(F("4 000 F"));
  await expect(page.getByTestId("stock-watch")).toContainText("Sucre du jalon 7");
  await expect(page.getByTestId("recent-activity")).toContainText("Awa Ndiaye");
  await shoot(page, "accueil");

  // 8. Le gérant voit la caisse (ventes du jour) mais pas les bénéfices.
  const m = await session(browser, manager.phoneInput, manager.password);
  await expect(m.page.getByTestId("month-profit")).toHaveCount(0);
  await expect(m.page.getByRole("link", { name: "Caisse" }).first()).toBeVisible();
  await m.page.goto("/profits");
  await expect(m.page).toHaveURL(/\/$/);
  await expect(m.page.getByTestId("day-sales")).toHaveAttribute("aria-busy", "false");
  await shoot(m.page, "accueil-gerant");

  await Promise.all([o.context.close(), m.context.close()]);
});
