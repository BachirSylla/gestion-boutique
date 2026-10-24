import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_TENANT_PREFIX, randomTestPhone, readFixture } from "./fixtures";

const WIDTHS = [
  { name: "360", width: 360, height: 780 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;
const CAPTURES = "docs/captures/jalon-2";

async function shoot(page: Page, name: string) {
  for (const { name: w, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} à ${w} px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${CAPTURES}/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function newSession(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "fr-SN", timezoneId: "Africa/Dakar" });
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  return { context, page };
}

async function login(page: Page, phoneInput: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Numéro de téléphone").fill(phoneInput);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function choosePassword(page: Page, password: string) {
  await expect(page).toHaveURL(/\/first-password$/);
  await expect(page.getByRole("heading", { name: "Choisissez votre mot de passe" })).toBeVisible();
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(password);
  await page.getByLabel("Confirmer le nouveau mot de passe").fill(password);
  await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe.configure({ mode: "serial" });

test("comptes : de la création du propriétaire à la suspension", async ({ browser }) => {
  test.setTimeout(240_000);
  const { platformAdmin } = readFixture();
  const ownerPhone = randomTestPhone();
  const managerPhone = randomTestPhone();
  const tenantName = `${E2E_TENANT_PREFIX}Awa Ndiaye`;

  // 1. L'admin crée un propriétaire et sa première boutique.
  const admin = await newSession(browser);
  await login(admin.page, platformAdmin.phoneInput, platformAdmin.password);
  await admin.page.getByRole("link", { name: "Propriétaires" }).first().click();
  await expect(admin.page.getByRole("heading", { name: "Propriétaires", level: 1 })).toBeVisible();
  await admin.page.getByRole("link", { name: "Nouveau propriétaire" }).click();
  await admin.page.getByLabel("Nom complet").fill("Awa Ndiaye");
  await admin.page.getByLabel("Numéro de téléphone").fill(ownerPhone.phoneInput);
  await admin.page.getByLabel("Nom du compte (facultatif)").fill(tenantName);
  await admin.page.getByLabel("Nom de la boutique").fill("Boutique Awa");
  await admin.page.getByLabel("Quartier").fill("Pikine");
  await admin.page.getByLabel("Ville").fill("Dakar");
  await shoot(admin.page, "admin-nouveau-proprietaire");
  await admin.page.getByRole("button", { name: "Créer le propriétaire" }).click();
  await expect(admin.page.getByText("Propriétaire créé.")).toBeVisible();
  const ownerTempPassword = (await admin.page.getByTestId("temporary-password").textContent())!.trim();
  expect(ownerTempPassword).toMatch(/^[a-z]{4}-\d{4}-[a-z]{4}$/);
  await expect(admin.page.getByRole("link", { name: "Envoyer par WhatsApp" })).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${ownerPhone.phone.slice(1)}\\?text=`));
  await shoot(admin.page, "admin-identifiants");

  // Le même numéro ne peut pas servir deux fois.
  await admin.page.goto("/admin/new");
  await admin.page.getByLabel("Nom complet").fill("Doublon");
  await admin.page.getByLabel("Numéro de téléphone").fill(ownerPhone.phoneInput);
  await admin.page.getByRole("button", { name: "Créer le propriétaire" }).click();
  await expect(admin.page.getByText("Ce numéro a déjà un compte Bitig.")).toBeVisible();

  await admin.page.goto("/admin");
  await expect(admin.page.getByText(tenantName)).toBeVisible();
  await shoot(admin.page, "admin-proprietaires");

  // 2. Le propriétaire se connecte avec le mot de passe provisoire et choisit le sien.
  const owner = await newSession(browser);
  await login(owner.page, ownerPhone.phoneInput, ownerTempPassword);
  await expect(owner.page).toHaveURL(/\/first-password$/);
  await shoot(owner.page, "premier-mot-de-passe");
  // Tant que le mot de passe n'est pas changé, l'application renvoie vers cette page.
  await owner.page.goto("/team");
  await expect(owner.page).toHaveURL(/\/first-password$/);
  await choosePassword(owner.page, "Awa-motdepasse-2026");
  await expect(owner.page.getByRole("heading", { name: "Bonjour Awa Ndiaye" })).toBeVisible();

  // 3. Il crée une seconde boutique, puis un gérant rattaché à la première seulement.
  await owner.page.getByRole("link", { name: "Boutiques" }).first().click();
  await owner.page.getByLabel("Nom de la boutique").fill("Boutique Thiaroye");
  await owner.page.getByRole("button", { name: "Créer" }).click();
  await expect(owner.page.getByText("Boutique créée.")).toBeVisible();
  await expect(owner.page.getByRole("link", { name: /Boutique Thiaroye/ })).toBeVisible();
  await shoot(owner.page, "boutiques");

  await owner.page.getByRole("link", { name: "Équipe" }).first().click();
  await owner.page.getByRole("link", { name: "Ajouter un employé" }).click();
  await owner.page.getByLabel("Nom complet").fill("Moussa Sarr");
  await owner.page.getByLabel("Numéro de téléphone").fill(managerPhone.phoneInput);
  await owner.page.getByLabel("Boutique Awa").check();
  await owner.page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(owner.page.getByText("Compte créé.")).toBeVisible();
  const managerTempPassword = (await owner.page.getByTestId("temporary-password").textContent())!.trim();

  await owner.page.goto("/team");
  await expect(owner.page.getByRole("link", { name: /Moussa Sarr/ })).toBeVisible();
  await shoot(owner.page, "equipe");

  // 4. Le gérant ne voit que sa boutique, ni l'équipe ni les boutiques.
  const manager = await newSession(browser);
  await login(manager.page, managerPhone.phoneInput, managerTempPassword);
  await choosePassword(manager.page, "Moussa-motdepasse-1");
  await expect(manager.page.getByText("Vous travaillez sur : Boutique Awa")).toBeVisible();
  await expect(manager.page.getByText("Votre boutique")).toBeVisible();
  await expect(manager.page.getByRole("link", { name: "Équipe" })).toHaveCount(0);
  await manager.page.goto("/team");
  await expect(manager.page).toHaveURL(/\/$/);
  await manager.page.goto("/shops");
  await expect(manager.page).toHaveURL(/\/$/);

  // 5. Le propriétaire change de boutique courante.
  await owner.page.goto("/");
  await owner.page.getByLabel("Changer de boutique").first().selectOption({ label: "Boutique Thiaroye" });
  await expect(owner.page.getByText("Vous travaillez sur : Boutique Thiaroye")).toBeVisible();
  await owner.page.reload();
  await expect(owner.page.getByText("Vous travaillez sur : Boutique Thiaroye")).toBeVisible();

  // Rattachement du gérant à la seconde boutique : il la voit au chargement suivant.
  await owner.page.goto("/team");
  await owner.page.getByRole("link", { name: /Moussa Sarr/ }).click();
  await owner.page.getByLabel("Boutique Thiaroye").check();
  await owner.page.getByRole("button", { name: "Enregistrer les boutiques" }).click();
  await expect(owner.page.getByText("Boutiques enregistrées.")).toBeVisible();
  await shoot(owner.page, "fiche-employe");
  await manager.page.goto("/");
  await expect(manager.page.getByText("Vos 2 boutiques")).toBeVisible();

  // 6. Le propriétaire désactive le gérant : il est déconnecté avec un message.
  await owner.page.getByRole("button", { name: "Désactiver le compte" }).click();
  await expect(owner.page.getByText("Ce compte est désactivé : la personne ne peut plus se connecter.")).toBeVisible();
  await manager.page.goto("/");
  await expect(manager.page).toHaveURL(/\/login\?error=accountDisabled$/);
  await login(manager.page, managerPhone.phoneInput, "Moussa-motdepasse-1");
  await expect(manager.page.getByText("Ce compte est désactivé.")).toBeVisible();

  // 7. Changement de mot de passe depuis « Mon compte » (mot de passe actuel revérifié).
  await owner.page.goto("/account");
  await owner.page.getByLabel("Mot de passe actuel").fill("mauvais-mot-de-passe");
  await owner.page.getByLabel("Nouveau mot de passe", { exact: true }).fill("Awa-nouveau-2026");
  await owner.page.getByLabel("Confirmer le nouveau mot de passe").fill("Awa-nouveau-2026");
  await owner.page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(owner.page.getByText("Le mot de passe actuel est incorrect.")).toBeVisible();
  await owner.page.getByLabel("Mot de passe actuel").fill("Awa-motdepasse-2026");
  await owner.page.getByLabel("Nouveau mot de passe", { exact: true }).fill("Awa-nouveau-2026");
  await owner.page.getByLabel("Confirmer le nouveau mot de passe").fill("Awa-nouveau-2026");
  await owner.page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(owner.page.getByText("Mot de passe changé.")).toBeVisible();

  // 8. L'admin réinitialise le mot de passe du propriétaire, puis le suspend.
  await admin.page.goto("/admin");
  await admin.page.getByRole("link", { name: new RegExp(tenantName.replace(/[[\]]/g, "\\$&")) }).click();
  await admin.page.getByRole("button", { name: "Réinitialiser le mot de passe" }).click();
  await expect(admin.page.getByTestId("temporary-password")).toBeVisible();
  await admin.page.getByRole("button", { name: "Suspendre le propriétaire" }).click();
  await expect(admin.page.getByText("Ce propriétaire est suspendu")).toBeVisible();
  await shoot(admin.page, "admin-fiche-proprietaire");
  await owner.page.goto("/");
  await expect(owner.page).toHaveURL(/\/login\?error=tenantSuspended$/);

  await Promise.all([admin.context.close(), owner.context.close(), manager.context.close()]);
});
