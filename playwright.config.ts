import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Parcours de bout en bout sur le build de production (le hors ligne n'est fiable qu'en production).
// Prérequis : pnpm build. Les données de test sont créées puis supprimées (tests/e2e/global-*.ts).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Base distante (Londres) depuis le poste de développement : latences variables.
  expect: { timeout: 25_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-SN",
    timezoneId: "Africa/Dakar",
    trace: "retain-on-failure",
    // Un blocage doit échouer vite plutôt qu'attendre la fin du test.
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
