import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomTestPhone, readFixture } from "./fixtures";

const WIDTHS = [
  { name: "360", width: 360, height: 780 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;
const CAPTURES = "docs/captures/jalon-3";
const NBSP = " ";
const F = (text: string) => text.replace(/ /g, NBSP); // « 13 680 F » avec espaces insécables

async function shoot(page: Page, name: string) {
  for (const { name: w, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} à ${w} px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${CAPTURES}/${name}-${w}.png`, fullPage: true });
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

/** Solde affiché en grand sur la fiche client (montant signé + libellé). */
async function expectBalance(page: Page, amount: string, label: "doit" | "avance" | "à jour") {
  const card = page.getByRole("main").locator("section").filter({ hasText: "Solde" }).first();
  await expect(card).toContainText(F(amount));
  await expect(card).toContainText(label);
}

/** Attend que les saisies de l'appareil soient envoyées (indicateur « Synchronisé »). */
async function waitSynced(page: Page) {
  await expect(page.getByTestId("sync-indicator").first()).toHaveAttribute("data-state", "synced");
}

test.describe.configure({ mode: "serial" });

test("clients et journal : prises, versements, plafond, annulations", async ({ browser }) => {
  test.setTimeout(300_000);
  const { owner, manager } = readFixture();
  const customerPhone = randomTestPhone();

  const o = await session(browser, owner.phoneInput, owner.password);
  const page = o.page;

  // Le gérant de test tient « Boutique Keur Fatou » : le propriétaire y travaille aussi.
  await page.getByLabel("Changer de boutique").first().selectOption({ label: "Boutique Keur Fatou" });
  await expect(page.getByText("Vous travaillez sur : Boutique Keur Fatou")).toBeVisible();

  // 1. Nouveau client mensuel avec plafond.
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("link", { name: "Nouveau client" }).click();
  await page.getByLabel("Nom du client").fill("Awa Ndiaye");
  await page.getByLabel("Téléphone (facultatif)").fill(customerPhone.phoneInput);
  await page.getByLabel("Crédit mensuel").check();
  await page.getByLabel("Plafond de crédit (facultatif)").fill("25000");
  await expect(page.getByLabel("Plafond de crédit (facultatif)")).toHaveValue(F("25 000"));
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("heading", { name: "Awa Ndiaye" })).toBeVisible();
  await expectBalance(page, "0 F", "à jour");

  // 2. Prise rapide depuis l'accueil : client → montant → enregistrer.
  await page.goto("/");
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Rechercher").fill("awa");
  await page.getByRole("link", { name: /Awa Ndiaye/ }).click();
  await page.getByLabel("Montant").fill("13680");
  await page.getByLabel("Note (facultatif)").fill("riz + huile");
  await expect(page.getByText(F("−13 680 F")).first()).toBeVisible(); // nouveau solde en direct
  await shoot(page, "prise-rapide");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(page.getByText("Prise enregistrée.")).toBeVisible();
  await expectBalance(page, "−13 680 F", "doit");

  // 3. Prise détaillée : arrondi par ligne au pas de 5 F (0,25 kg × 315 F = 78,75 F → 80 F).
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByRole("radio", { name: "Détaillé" }).click();
  await page.getByLabel("Article", { exact: true }).fill("Riz brisé");
  await page.getByLabel("Quantité").fill("0,25");
  await page.getByLabel("Prix unitaire").fill("315");
  await expect(page.getByText(`Montant de la ligne : 80${NBSP}F`)).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un article" }).click();
  await page.getByLabel("Article", { exact: true }).nth(1).fill("Huile");
  await page.getByLabel("Quantité").nth(1).fill("0,5");
  await page.getByLabel("Unité").nth(1).selectOption("l");
  await page.getByLabel("Prix unitaire").nth(1).fill("1100");
  await expect(page.getByRole("button", { name: /Enregistrer la prise/ })).toContainText(F("630 F"));
  await shoot(page, "prise-detaillee");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expect(page.getByText("Prise enregistrée.")).toBeVisible();
  await expectBalance(page, "−14 310 F", "doit");
  await expect(page.getByText(`Riz brisé · 0,25 kg × 315${NBSP}F = 80${NBSP}F`).first()).toBeVisible();

  // 4. Versement Wave.
  await page.getByRole("link", { name: "Versement" }).click();
  await page.getByLabel("Montant").fill("5000");
  await page.getByLabel("Wave").check();
  await shoot(page, "versement");
  await page.getByRole("button", { name: /Enregistrer le versement/ }).click();
  await expect(page.getByText("Versement enregistré.")).toBeVisible();
  await expectBalance(page, "−9 310 F", "doit");

  // 5. « Annuler » juste après une saisie.
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("1000");
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expectBalance(page, "−10 310 F", "doit");
  await page.getByRole("status").filter({ hasText: "Prise enregistrée." }).getByRole("button", { name: /^Annuler/ }).click();
  await expect(page.getByText("Opération annulée.")).toBeVisible();
  // Navigation explicite (le bandeau retire lui-même « ?saved » de l'adresse au bout de 10 s).
  await page.reload();
  await expectBalance(page, "−9 310 F", "doit");
  await expect(page.getByText("Annulée").first()).toBeVisible();

  // 6. Plafond : simple alerte, la prise reste possible.
  await page.getByRole("link", { name: "Nouvelle prise" }).click();
  await page.getByLabel("Montant").fill("20000");
  await expect(page.getByText(`Après cette prise, le plafond de 25${NBSP}000${NBSP}F sera dépassé de 4${NBSP}310${NBSP}F.`)).toBeVisible();
  await page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expectBalance(page, "−29 310 F", "doit");
  await expect(page.getByText(`Plafond dépassé de 4${NBSP}310${NBSP}F`).first()).toBeVisible();
  await shoot(page, "fiche-client");

  // 7. « À relancer » (calculé par le serveur) : plafond dépassé, message WhatsApp prérempli.
  await waitSynced(page);
  await page.getByRole("link", { name: "À relancer" }).first().click();
  await expect(page.getByText(`Plafond dépassé de 4${NBSP}310${NBSP}F`)).toBeVisible();
  const whatsapp = page.getByRole("link", { name: "Relancer par WhatsApp" });
  await expect(whatsapp).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${customerPhone.phone.slice(1)}\\?text=Bonjour%20Awa%20Ndiaye`));
  await shoot(page, "a-relancer");

  // 8. Le gérant : annulation libre de sa propre prise, demande pour celle du propriétaire.
  const m = await session(browser, manager.phoneInput, manager.password);
  await m.page.goto("/customers");
  await m.page.getByRole("link", { name: /Awa Ndiaye/ }).click();
  await m.page.getByRole("link", { name: "Nouvelle prise" }).click();
  await m.page.getByLabel("Montant").fill("500");
  await m.page.getByRole("button", { name: /Enregistrer la prise/ }).click();
  await expectBalance(m.page, "−29 810 F", "doit");
  await m.page.reload();
  const own = m.page.locator("li").filter({ hasText: `−500${NBSP}F` }).filter({ hasText: "par Ousmane Sarr" });
  await own.getByRole("button", { name: "Annuler l'opération" }).click();
  await m.page.getByTestId("confirm-dialog-ok").click();
  await expectBalance(m.page, "−29 310 F", "doit");

  const ownersTake = m.page.locator("li").filter({ hasText: `−20${NBSP}000${NBSP}F` }).filter({ hasText: "par Fatou Diallo" });
  await ownersTake.getByRole("button", { name: "Demander l'annulation" }).click();
  await ownersTake.getByLabel("Motif de la demande").fill("Le client conteste cette prise");
  await ownersTake.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(m.page.getByText("Demande envoyée au propriétaire.")).toBeVisible();
  await waitSynced(m.page);
  await expect(m.page.getByRole("link", { name: "Réglages" })).toHaveCount(0);

  // 9. Le propriétaire valide la demande.
  await page.goto("/");
  await expect(page.getByText("1 demande d'annulation en attente")).toBeVisible();
  await shoot(page, "accueil");
  await page.getByText("1 demande d'annulation en attente").click();
  await expect(page.getByText("Le client conteste cette prise")).toBeVisible();
  await shoot(page, "annulations");
  await page.getByRole("button", { name: "Valider l'annulation" }).click();
  await expect(page.getByText("Annulation validée.")).toBeVisible();
  await page.goto("/customers");
  await expect(page.getByRole("link", { name: /Awa Ndiaye/ })).toContainText(F("−9 310 F"));
  await shoot(page, "clients");

  // 10. Réglages : délai d'annulation porté à 60 min, arrondi à 25 F.
  await page.goto("/settings");
  await page.getByLabel("Délai d'annulation libre du gérant (minutes)").fill("60");
  await page.getByLabel("25 F").check();
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByText("Réglages enregistrés.")).toBeVisible();
  await page.getByLabel("Délai d'annulation libre du gérant (minutes)").fill("61");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByText("Vérifiez les champs signalés.")).toBeVisible(); // 61 min : refusé

  await Promise.all([o.context.close(), m.context.close()]);
});
