import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

/**
 * Suite e2e Playwright. Lance son propre serveur de dev sur un port dédié
 * (isolé du port habituel 8080/8081 utilisé en développement manuel) pour
 * éviter tout conflit avec un serveur déjà en cours d'exécution.
 *
 * Les tests partagent un backend Django/PostgreSQL réel (pas d'état mocké
 * isolé par page) : les exécuter en parallèle les fait entrer en contention
 * sur la même base, d'où des échecs par timeout non liés au produit. On
 * force donc un seul worker, en local comme en CI.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite dev --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
