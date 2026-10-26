import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomTestPhone, readFixture } from "./fixtures";

async function session(browser: Browser, phoneInput: string, password: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-SN", timezoneId: "Africa/Dakar", acceptDownloads: true });
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

test("documents : reçu (image, hors ligne), relevé PDF, relance WhatsApp", async ({ browser }) => {
  test.setTimeout(300_000);
  const { manager } = readFixture();
  const phone = randomTestPhone();
  const { context, page } = await session(browser, manager.phoneInput, manager.password);
  await page.goto("/customers");
  await synced(page);

  // Client, prise et versement.
  await page.getByRole("link", { name: "Nouveau client" }).click();
  await page.getByLabel("Nom du client").fill("Awa Ndiaye");
  await page.getByLabel("Téléphone (facultatif)").fill(phone.phoneInput);
  await page.getByLabel("Crédit mensuel").check();
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("13680");
  await page.getByLabel("Note (facultatif)").fill("riz + huile");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(page.getByText("Prise enregistrée.")).toBeVisible();

  // 1. « Envoyer le reçu » juste après la saisie : image au nom explicite (téléchargée faute de partage).
  const receiptDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Envoyer le reçu" }).click();
  const receipt = await receiptDownload;
  expect(receipt.suggestedFilename()).toMatch(/^Recu_Awa-Ndiaye_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.png$/);
  await receipt.saveAs("docs/captures/jalon-6/exemple-recu.png");
  const png = readFileSync("docs/captures/jalon-6/exemple-recu.png");
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  await synced(page);

  // 2. Versement, puis reçu du versement hors ligne (tout se calcule sur l'appareil).
  await page.getByRole("link", { name: "Versement" }).click();
  await page.getByLabel("Montant").fill("5000");
  await page.getByLabel("Wave").check();
  await page.getByRole("button", { name: /Enregistrer le versement/ }).click();
  await expect(page.getByText("Versement enregistré.")).toBeVisible();
  await context.setOffline(true);
  const offlineDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Envoyer le reçu" }).click();
  expect((await offlineDownload).suggestedFilename()).toMatch(/^Recu_Awa-Ndiaye_.*\.png$/);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await synced(page);

  // 3. Relevé du mois en PDF.
  await page.getByRole("link", { name: "Relevé" }).click();
  await expect(page.getByRole("heading", { name: "Relevé de compte" })).toBeVisible();
  await page.screenshot({ path: "docs/captures/jalon-6/releve-360.png", fullPage: true });
  const statementDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Préparer le relevé (PDF)" }).click();
  const statement = await statementDownload;
  expect(statement.suggestedFilename()).toMatch(/^Releve_Awa-Ndiaye_\d{4}-\d{2}-01_au_\d{4}-\d{2}-\d{2}\.pdf$/);
  await statement.saveAs("docs/captures/jalon-6/exemple-releve.pdf");
  const pdf = readFileSync("docs/captures/jalon-6/exemple-releve.pdf").toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  expect(pdf).toContain("Awa Ndiaye");
  expect(pdf).toContain("13 680 F"); // prise
  expect(pdf).toContain("8 680 F"); // reste à payer
  await expect(page.getByText("Relevé téléchargé")).toBeVisible();

  // 4. Relance WhatsApp préremplie depuis la fiche.
  await page.getByRole("link", { name: "Awa Ndiaye" }).click();
  await expect(page.getByRole("link", { name: "Relancer par WhatsApp" })).toHaveAttribute(
    "href",
    new RegExp(`^https://wa\\.me/${phone.phone.slice(1)}\\?text=Bonjour%20Awa%20Ndiaye`),
  );
  await page.screenshot({ path: "docs/captures/jalon-6/fiche-documents-360.png", fullPage: true });

  await context.close();
});
