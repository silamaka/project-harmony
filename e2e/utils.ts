import type { Page } from "@playwright/test";

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
 * L'app démarre sans aucune donnée métier (voir mock-data.ts) : les tests qui
 * ont besoin d'au moins une mission doivent la créer eux-mêmes plutôt que de
 * dépendre d'un jeu de données pré-rempli. Crée la chaîne minimale requise
 * (un client, un projet, une mission) via l'UI, en admin, et laisse la page
 * sur /missions. Le titre généré est retourné pour que le test puisse le
 * cibler sans ambiguïté.
 */
export async function seedMission(page: Page): Promise<{ title: string }> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const clientName = `Client E2E ${suffix}`;
  const projectName = `Projet E2E ${suffix}`;
  const missionTitle = `Mission E2E ${suffix}`;

  await page.goto("/parametres", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Inviter un utilisateur" }).click();
  await page.getByLabel("Prénom").fill("Client");
  await page.getByLabel("E-mail").fill(`client.${suffix}@e2e.test`);
  await page.getByLabel("Mot de passe").fill("demo1234");
  await page.getByLabel("Rôle").selectOption("client");
  await page.getByLabel("Nom de l'entreprise").fill(clientName);
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.waitForTimeout(500);

  await page.goto("/projets", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nouveau projet" }).click();
  await page.getByLabel("Nom du projet").fill(projectName);
  await page.getByLabel("Client").selectOption({ label: clientName });
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForTimeout(500);

  await page.goto("/missions", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nouvelle mission" }).click();
  await page.getByLabel("Titre").fill(missionTitle);
  await page.getByLabel("Projet").selectOption({ label: projectName });
  await page.getByRole("button", { name: "Créer la mission" }).click();
  await page.waitForTimeout(500);

  return { title: missionTitle };
}
