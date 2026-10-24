import { expect, test, type Page } from "@playwright/test";
import { readFixture } from "./fixtures";

const WIDTHS = [
  { name: "360", width: 360, height: 780 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;

const CAPTURES = "docs/captures/jalon-1";

async function login(page: Page, phoneInput: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Numéro de téléphone").fill(phoneInput);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("connexion", () => {
  test("un visiteur non connecté est renvoyé vers la connexion", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  });

  for (const { name, width, height } of WIDTHS) {
    test(`page de connexion à ${name} px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: `${CAPTURES}/connexion-${name}.png`, fullPage: true });
    });
  }

  test("un numéro invalide est signalé sans appel réseau", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Numéro de téléphone").fill("12 34");
    await page.getByLabel("Mot de passe", { exact: true }).fill("peu importe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Ce numéro n'est pas valide")).toBeVisible();
  });

  test("un mauvais mot de passe est refusé", async ({ page }) => {
    const { owner } = readFixture();
    await login(page, owner.phoneInput, "mauvais-mot-de-passe");
    await expect(page.getByText("Numéro ou mot de passe incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("un compte désactivé est déconnecté avec un message", async ({ page }) => {
    const { disabledManager } = readFixture();
    await login(page, disabledManager.phoneInput, disabledManager.password);
    await expect(page).toHaveURL(/\/login\?error=accountDisabled$/);
    await expect(page.getByText("Ce compte est désactivé.")).toBeVisible();
    // La session a bien été effacée : l'accueil renvoie à la connexion.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("propriétaire connecté", () => {
  test("se connecte avec son numéro, voit ses boutiques, se déconnecte", async ({ page }) => {
    const { owner } = readFixture();
    await login(page, `+221 ${owner.phoneInput}`, owner.password);
    await expect(page.getByRole("heading", { name: `Bonjour ${owner.fullName}` })).toBeVisible();
    await expect(page.getByText("Vos 2 boutiques")).toBeVisible();
    await expect(page.getByText("Boutique Keur Fatou")).toBeVisible();

    for (const { name, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: `${CAPTURES}/accueil-${name}.png`, fullPage: true });
    }

    // Déjà connecté : /login renvoie à l'accueil.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("PWA", () => {
  test("le manifeste, les icônes et le service worker sont servis", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const json = await manifest.json();
    expect(json).toMatchObject({ short_name: "Bitig", display: "standalone", start_url: "/" });
    for (const icon of json.icons as { src: string }[]) {
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    }
    const sw = await request.get("/serwist/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["content-type"]).toContain("javascript");
  });

  test("le service worker s'installe et la page de secours s'affiche hors ligne", async ({ page, context }) => {
    await page.goto("/login");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    // Une page jamais visitée : le service worker sert la page de secours.
    await page.goto("/jamais-visitee");
    await expect(page.getByRole("heading", { name: "Pas de réseau" })).toBeVisible();
    // La page de connexion déjà visitée reste disponible hors ligne.
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByText("Hors ligne", { exact: true })).toBeVisible();
    await context.setOffline(false);
  });
});
