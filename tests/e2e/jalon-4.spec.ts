import { expect, test, type Browser, type Page } from "@playwright/test";
import { admin, readFixture } from "./fixtures";

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
    await page.screenshot({ path: `docs/captures/jalon-4/${name}-${w}.png`, fullPage: true });
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

const indicator = (page: Page) => page.getByTestId("sync-indicator").first();
const sheetBalance = (page: Page) => page.getByRole("main").locator("section").filter({ hasText: "Solde" }).first();

test.describe.configure({ mode: "serial" });

test("hors ligne : saisie sans réseau, reprise, renvoi sans doublon, refus visible", async ({ browser }) => {
  test.setTimeout(300_000);
  const { manager, owner } = readFixture();
  const m = await session(browser, manager.phoneInput, manager.password);
  const page = m.page;

  // Première synchronisation en ligne et mise en cache des écrans (service worker).
  await page.goto("/customers");
  await expect(indicator(page)).toHaveAttribute("data-state", "synced");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(indicator(page)).toHaveAttribute("data-state", "synced");

  // 1. Coupure du réseau : ouverture à froid de l'écran des clients, servi par le cache.
  await m.context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(indicator(page)).toHaveAttribute("data-state", "offline");

  // 2. Nouveau client et prise, sans réseau.
  await page.getByRole("link", { name: "Nouveau client" }).click();
  await page.getByLabel("Nom du client").fill("Cheikh Diop");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("heading", { name: "Cheikh Diop" })).toBeVisible();
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("3000");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(sheetBalance(page)).toContainText(F("−3 000 F"));
  await expect(page.getByText("En attente d'envoi").first()).toBeVisible();
  await expect(indicator(page)).toContainText("Hors ligne · 2 en attente");
  await shoot(page, "hors-ligne-fiche");

  // 3. Retour du réseau : envoi automatique, sans doublon.
  await m.context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(indicator(page)).toHaveAttribute("data-state", "synced");
  const db = admin();
  // Restreint à la boutique de test : la démonstration a aussi un « Cheikh Diop ».
  const { data: cheikh } = await db.from("customers").select("id").in("shop_id", readFixture().shopIds).eq("full_name", "Cheikh Diop").single();
  const { data: takes } = await db.from("customer_operations").select("amount").eq("customer_id", cheikh!.id).eq("kind", "take");
  expect(takes).toEqual([{ amount: 3000 }]);

  // 4. Réponse perdue : le serveur enregistre, l'appareil ne reçoit rien et renvoie → toujours une seule prise.
  let lost = false;
  await page.route("**/rest/v1/rpc/record_take", async (route) => {
    if (lost) return route.continue();
    lost = true;
    await route.fetch(); // la requête atteint le serveur…
    await route.abort("failed"); // …mais la réponse n'arrive jamais
  });
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("1000");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(sheetBalance(page)).toContainText(F("−4 000 F"));
  await expect(indicator(page)).toHaveAttribute("data-state", "synced"); // renvoi automatique après quelques secondes
  expect(lost).toBe(true);
  const { data: afterRetry } = await db.from("customer_operations").select("amount").eq("customer_id", cheikh!.id).eq("kind", "take").order("amount");
  expect(afterRetry).toEqual([{ amount: 1000 }, { amount: 3000 }]);
  await page.unroute("**/rest/v1/rpc/record_take");

  // 5. Refus visible : une prise hors ligne sur un client archivé entre-temps par le propriétaire.
  await m.context.setOffline(true);
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("500");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(sheetBalance(page)).toContainText(F("−4 500 F"));

  const o = await session(browser, owner.phoneInput, owner.password);
  await o.page.getByLabel("Changer de boutique").first().selectOption({ label: "Boutique Keur Fatou" });
  await o.page.goto(`/customers/${cheikh!.id}/edit`);
  await o.page.getByRole("button", { name: "Archiver le client" }).click();
  await o.page.getByTestId("confirm-dialog-ok").click();
  await expect(o.page).toHaveURL(/\/customers$/);

  await m.context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(indicator(page)).toHaveAttribute("data-state", "rejected");
  await expect(indicator(page)).toContainText("1 saisie refusée");
  await expect(page.getByText("Refusée : Ce client est archivé.")).toBeVisible();
  await expect(sheetBalance(page)).toContainText(F("−4 000 F")); // la prise refusée ne compte pas
  await indicator(page).click();
  await expect(page.getByRole("heading", { name: "Saisies refusées" })).toBeVisible();
  await shoot(page, "synchronisation-refus");
  await page.getByRole("button", { name: "J'ai compris, retirer" }).click();
  await expect(page.getByText("Aucune saisie refusée.")).toBeVisible();
  await expect(indicator(page)).toHaveAttribute("data-state", "synced");

  await Promise.all([m.context.close(), o.context.close()]);
});
