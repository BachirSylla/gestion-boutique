import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFixture } from "./fixtures";

const NBSP = " ";
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
    await page.screenshot({ path: `docs/captures/jalon-5/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function session(browser: Browser, phoneInput: string, password: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "fr-SN", timezoneId: "Africa/Dakar" });
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/login");
  await page.getByLabel("Numéro de téléphone").fill(phoneInput);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
  return { context, page };
}

test.describe.configure({ mode: "serial" });

test("catalogue et prix : catalogue de départ, hausse en attente, favoris, prix figé", async ({ browser }) => {
  test.setTimeout(300_000);
  const { owner, manager } = readFixture();
  const o = await session(browser, owner.phoneInput, owner.password);
  const page = o.page;
  await page.getByLabel("Changer de boutique").first().selectOption({ label: "Boutique Keur Fatou" });
  await expect(page.getByText("Vous travaillez sur : Boutique Keur Fatou")).toBeVisible();

  // Arrondi au pas de 5 F (un autre parcours a pu le changer sur cette boutique de test).
  await page.goto("/settings");
  await page.getByLabel("5 F", { exact: true }).check();
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByText("Réglages enregistrés.")).toBeVisible();

  // 1. Catalogue de départ.
  await page.getByRole("link", { name: "Catalogue" }).first().click();
  await page.getByRole("button", { name: "Ajouter le catalogue de départ" }).click();
  await expect(page.getByRole("link", { name: /Riz brisé/ })).toContainText(F("315 F / kg"));
  await expect(page.getByRole("link", { name: /Huile/ })).toBeVisible();
  await shoot(page, "catalogue");

  // 2. Hausse du riz : prix des formats proposés, politique « après écoulement » proposée par défaut.
  await page.getByRole("link", { name: /Riz brisé/ }).click();
  const retail = page.getByLabel("Prix de détail par kg");
  await retail.fill("330");
  await expect(page.getByLabel("Prix", { exact: true }).first()).toHaveValue("170"); // ½ kg : 160 × 330 / 315 = 167,6 → 170
  await expect(page.getByLabel("Après écoulement de l'ancien stock")).toBeChecked();
  await page.getByRole("button", { name: "Enregistrer le nouveau prix" }).click();
  await expect(page.getByText(`Hausse en attente : 330${NBSP}F / kg au prochain arrivage.`, { exact: false })).toBeVisible();
  await expect(page.getByText("En vigueur")).toBeVisible();
  await shoot(page, "produit-prix-en-attente");

  // 3. Le gérant fait une prise détaillée avec les favoris (l'ancien prix reste en vigueur).
  const m = await session(browser, manager.phoneInput, manager.password);
  await m.page.goto("/customers");
  await m.page.getByRole("link", { name: "Nouveau client" }).click();
  await m.page.getByLabel("Nom du client").fill("Mariama Sow");
  await m.page.getByRole("button", { name: "Créer le client" }).click();
  await m.page.getByRole("link", { name: "Nouvelle prise" }).click();
  await m.page.getByRole("radio", { name: "Détaillé" }).click();
  const halfKg = m.page.getByRole("button", { name: /^Riz brisé ½ kg/ });
  await halfKg.click();
  await halfKg.click();
  await expect(m.page.getByText("2 × Riz brisé ½ kg")).toBeVisible();
  await m.page.getByRole("button", { name: "Ajouter un article" }).click();
  await m.page.getByLabel("Produit").selectOption({ label: "Huile" });
  await m.page.getByLabel("Quantité").fill("0,5");
  await expect(m.page.getByRole("button", { name: /Enregistrer la prise/ })).toContainText(F("870 F")); // 2 × 160 + 0,5 × 1 100
  await shoot(m.page, "prise-favoris");
  await m.page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(m.page.getByText("Prise enregistrée.")).toBeVisible();
  await expect(m.page.getByTestId("sync-indicator").first()).toHaveAttribute("data-state", "synced");

  // 4. Baisse immédiate du riz : les lignes déjà enregistrées gardent leur prix (RG3).
  await page.reload();
  await retail.fill("300");
  await expect(page.getByLabel("Tout de suite")).toBeChecked(); // baisse : immédiate par défaut
  await page.getByRole("button", { name: "Enregistrer le nouveau prix" }).click();
  await expect(page.getByText("Prix enregistré.")).toBeVisible();
  await expect(page.getByText("Hausse en attente")).toHaveCount(0); // la nouvelle grille remplace l'attente

  await m.page.reload();
  await expect(m.page.getByText(`Riz brisé ½ kg · 1 kg × 160${NBSP}F = 320${NBSP}F`)).toBeVisible();

  await Promise.all([o.context.close(), m.context.close()]);
});
