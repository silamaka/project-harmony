import type { Page } from "@playwright/test";
import { seedClientMission } from "./api";

export const DEMO_ACCOUNTS = {
  admin: { email: "admin@bebaempire.com", password: "demo1234" },
  chefProjet: { email: "sara@bebaempire.com", password: "demo1234" },
  collaborateur: { email: "yassine@bebaempire.com", password: "demo1234" },
  client: { email: "omar@atlasretail.com", password: "demo1234" },
} as const;

const POST_LOGIN_URL = /\/(dashboard|mes-missions|portail)/;

/**
 * Connecte un compte de démo et attend la redirection post-login.
 * Si le clic sur "Se connecter" survient avant la fin de l'hydratation React,
 * le navigateur fait une soumission GET native du formulaire (le handler
 * onSubmit n'est pas encore attaché) : on retente proprement dans ce cas.
 */
export async function login(page: Page, account: keyof typeof DEMO_ACCOUNTS = "admin") {
  const { email, password } = DEMO_ACCOUNTS[account];

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL(POST_LOGIN_URL, { timeout: 8000 });
      return;
    } catch {
      // Soumission native probable : on relance une tentative propre.
    }
  }

  await page.waitForURL(POST_LOGIN_URL, { timeout: 15000 });
}

/**
 * Le backend ne pré-remplit aucune donnée métier : les tests qui ont besoin
 * d'au moins une mission la créent eux-mêmes. La chaîne minimale (client,
 * compte client, projet, mission) est créée par l'API avec la session déjà
 * ouverte dans `page` (voir login), plutôt qu'en remplissant les
 * formulaires, qui changent avec l'interface. La page est laissée sur
 * /missions ; le titre généré permet de cibler la mission sans ambiguïté.
 * Appeler `cleanup` en fin de test (afterEach) pour ne rien laisser en base.
 */
export async function seedMission(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("beba.access_token"));
  if (!token) throw new Error("seedMission : aucune session ouverte (appeler login avant).");
  const { title, cleanup } = await seedClientMission(page.request, token);
  await page.goto("/missions", { waitUntil: "networkidle" });
  return { title, cleanup: () => cleanup(page.request) };
}
