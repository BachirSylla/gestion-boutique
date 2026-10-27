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

const synced = (page: Page) => expect(page.getByTestId("sync-indicator").first()).toHaveAttribute("data-state", "synced");
const card = (page: Page, name: string) => page.locator("article").filter({ has: page.getByText(name, { exact: true }) });

test.describe.configure({ mode: "serial" });

test("stock : réception, ouverture, prises, baisse immédiate, bilan, hausse après écoulement, hors ligne, inventaire", async ({ browser }) => {
  test.setTimeout(400_000);
  const { owner, manager } = readFixture();
  const o = await session(browser, owner.phoneInput, owner.password);
  const op = o.page;
  await op.getByLabel("Changer de boutique").first().selectOption({ label: "Boutique Keur Fatou" });
  await expect(op.getByText("Vous travaillez sur : Boutique Keur Fatou")).toBeVisible();
  await op.goto("/settings");
  await op.getByLabel("5 F", { exact: true }).check();
  await op.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(op.getByText("Réglages enregistrés.")).toBeVisible();
  // Produit propre à ce parcours (indépendant des prix modifiés par d'autres parcours).
  await op.goto("/catalog/new");
  await op.getByLabel("Nom du produit").fill("Riz du stock");
  await op.getByLabel("Contenance du conditionnement (kg)").fill("50");
  await op.getByLabel("Prix de détail par kg").fill("315");
  await op.getByLabel("Prix du conditionnement entier (facultatif)").fill("15000");
  await op.getByRole("button", { name: "Ajouter un format" }).click();
  await op.getByLabel("Format", { exact: true }).fill("1 kg");
  await op.getByLabel("Quantité (kg)").fill("1");
  await expect(op.getByLabel("Prix", { exact: true })).toHaveValue("315");
  await op.getByRole("button", { name: "Créer le produit" }).click();
  await expect(op.getByRole("heading", { name: "Riz du stock" })).toBeVisible();
  const rizUrl = new URL(op.url()).pathname;

  // 1. Le gérant réceptionne 2 sacs de riz à 14 400 F et en ouvre un.
  const m = await session(browser, manager.phoneInput, manager.password);
  const mp = m.page;
  await mp.goto("/stock");
  await synced(mp);
  await card(mp, "Riz du stock").getByRole("link", { name: /Riz du stock/ }).click();
  await mp.getByRole("link", { name: "Réception" }).click();
  await mp.getByLabel("Nombre de sacs").fill("2");
  await mp.getByLabel("Prix d'achat par sac").fill("14400");
  await mp.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(mp.getByText("2 sacs fermés")).toBeVisible();
  await mp.getByRole("button", { name: "Ouvrir" }).click();
  await expect(mp.getByText("1 entamé (plein)")).toBeVisible();
  await synced(mp);

  // 2. Prise détaillée : 2 × riz 1 kg (rattachée au sac entamé).
  await mp.goto("/customers");
  await mp.getByRole("link", { name: "Nouveau client" }).click();
  await mp.getByLabel("Nom du client").fill("Ibrahima Fall");
  await mp.getByRole("button", { name: "Créer le client" }).click();
  await mp.getByRole("link", { name: "Nouvelle prise" }).click();
  await mp.getByRole("radio", { name: "Détaillé" }).click();
  const kilo = mp.getByRole("button", { name: /^Riz du stock 1 kg/ });
  await kilo.click();
  await kilo.click();
  await mp.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(mp.getByText("Prise enregistrée.")).toBeVisible();
  await synced(mp);

  // 3. Baisse immédiate à 300 F/kg alors qu'il reste ½ sac : nouvelle tranche.
  await op.goto(rizUrl!);
  await op.getByLabel("Prix de détail par kg").fill("300");
  await expect(op.getByLabel("Tout de suite")).toBeChecked();
  await op.getByLabel("½").check();
  await op.getByRole("button", { name: "Enregistrer le nouveau prix" }).click();
  await expect(op.getByText("Prix enregistré.")).toBeVisible();

  // 4. Fin du sac : bilan = 25 kg × 315 + 25 kg × 300 = 15 375 F ; prises 630 F ; comptant 14 745 F ; marge 975 F.
  await mp.goto("/stock");
  await card(mp, "Riz du stock").getByRole("button", { name: "Terminé" }).click();
  await mp.getByTestId("confirm-dialog-ok").click();
  await synced(mp);
  await mp.reload();
  await card(mp, "Riz du stock").getByRole("link", { name: /Riz du stock/ }).click();
  const review = mp.getByTestId("package-review").first();
  await expect(review).toContainText(F("15 375 F"));
  await expect(review).toContainText(F("630 F"));
  await expect(review).toContainText(F("14 745 F"));
  await expect(review).toContainText(F("14 400 F"));
  await expect(review).toContainText(F("+975 F"));
  await shoot(mp, "bilan-de-sac");

  // 5. Hausse à 330 F/kg après écoulement : le 2e sac (ancien lot) garde 300 F/kg.
  await op.goto(rizUrl!);
  await op.getByLabel("Prix de détail par kg").fill("330");
  await expect(op.getByLabel("Après écoulement de l'ancien stock")).toBeChecked();
  await op.getByRole("button", { name: "Enregistrer le nouveau prix" }).click();
  await expect(op.getByText(/Hausse en attente/)).toBeVisible();
  await mp.getByRole("button", { name: "Ouvrir" }).click();
  await synced(mp);
  await op.reload();
  await expect(op.getByText(/Hausse en attente/)).toBeVisible(); // toujours en attente

  // 6. Hors ligne : réception de 2 sacs (nouveau lot), fin de l'ancien, ouverture du nouveau.
  await mp.goto("/stock");
  await synced(mp);
  await m.context.setOffline(true);
  await card(mp, "Riz du stock").getByRole("link", { name: /Riz du stock/ }).click();
  await mp.getByRole("link", { name: "Réception" }).click();
  await mp.getByLabel("Nombre de sacs").fill("2");
  await mp.getByLabel("Prix d'achat par sac").fill("15000");
  await mp.getByRole("button", { name: "Enregistrer la réception" }).click();
  await mp.getByRole("button", { name: "Terminé" }).click();
  await mp.getByTestId("confirm-dialog-ok").click();
  await mp.getByRole("button", { name: "Ouvrir" }).click();
  await expect(mp.getByText("1 sac fermé")).toBeVisible();
  await expect(mp.getByText("1 entamé (plein)")).toBeVisible();
  await expect(mp.getByTestId("sync-indicator").first()).toContainText("Hors ligne · 3 en attente");
  await m.context.setOffline(false);
  await mp.evaluate(() => window.dispatchEvent(new Event("online")));
  await synced(mp);
  // Le premier sac du nouveau lot est ouvert : la hausse s'applique.
  await op.reload();
  await expect(op.getByText(/Hausse en attente/)).toHaveCount(0);
  await expect(op.getByLabel("Prix de détail par kg")).toHaveValue("330");

  // 7. Vente d'un sac entier sur le compte d'Ibrahima.
  await mp.getByRole("link", { name: "Vendre entier" }).click();
  await mp.getByLabel("Sur le compte d'un client").check();
  const select = mp.getByRole("main").locator("select");
  const ibrahima = await select.locator("option", { hasText: "Ibrahima Fall" }).getAttribute("value");
  await select.selectOption(ibrahima!);
  await mp.getByRole("button", { name: "Enregistrer la vente" }).click();
  await expect(mp.getByText("Aucun sac fermé")).toBeVisible();
  await synced(mp);

  // 8. Inventaire : un sac retrouvé.
  await mp.goto("/stock#/inventory");
  const riz = mp.locator("section").filter({ hasText: "Riz du stock" }).first();
  await riz.getByLabel("sacs fermés comptés").fill("1");
  await expect(riz.getByText("Écart : +1")).toBeVisible();
  await shoot(mp, "inventaire");
  await mp.getByRole("button", { name: "Enregistrer l'inventaire" }).click();
  await expect(mp.getByText("Inventaire : 1 ajustement enregistré.")).toBeVisible();
  await expect(card(mp, "Riz du stock")).toContainText("1 sac fermé");
  await synced(mp);
  await shoot(mp, "stock");

  await Promise.all([o.context.close(), m.context.close()]);
});
