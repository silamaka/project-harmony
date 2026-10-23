import { expect, test, type Browser, type Page } from "@playwright/test";
import { apiLogin, seedClientMission, openSession, type Tokens } from "./api";
import { DEMO_ACCOUNTS } from "./utils";

/**
 * Circuit complet d'un livrable, à l'écran, avec l'agence et le client :
 * dépôt → validation agence (envoi) → publication programmée → corrections
 * demandées par le client →
 * version corrigée (v2) → renvoi → validation enregistrée puis annulée par
 * l'agence → validation du client, annulée par l'administrateur puis refaite →
 * publication.
 * Vérifie aussi les garde-fous : pas de publication avant la double
 * validation, le client ne voit rien avant l'envoi.
 *
 * Données préparées par l'API (entreprise, compte client, projet, mission)
 * et supprimées à la fin. Deux connexions seulement (limite serveur de
 * 10/min) : les sessions sont ouvertes en injectant les jetons.
 */

const NAME = "Bannière E2E";

let seed: Awaited<ReturnType<typeof seedClientMission>>;
let admin: Tokens;
let client: Tokens;

test.beforeAll(async ({ request }) => {
  const { email, password } = DEMO_ACCOUNTS.admin;
  admin = await apiLogin(request, email, password);
  seed = await seedClientMission(request, admin.access);
  client = await apiLogin(request, seed.clientEmail, "demo1234");
});

test.afterAll(async ({ request }) => {
  await seed?.cleanup(request);
});

async function openAs(browser: Browser, tokens: Tokens): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openSession(page, tokens);
  return page;
}

async function gotoMission(page: Page) {
  await page.goto(`/missions/${seed.missionId}`, { waitUntil: "networkidle" });
}

const card = (page: Page) => page.locator('[id^="livrable-"]', { hasText: NAME });

test("circuit complet d'un livrable entre l'agence et le client", async ({ browser }) => {
  test.setTimeout(120_000);
  const agency = await openAs(browser, admin);
  const customer = await openAs(browser, client);

  await test.step("l'agence dépose le livrable : en revue, invisible du client", async () => {
    await gotoMission(agency);
    await agency.getByPlaceholder("Nom du livrable (ex. Maquette homepage)").fill(NAME);
    await agency.getByPlaceholder("https://… (facultatif)").fill("https://example.com/banniere-v1");
    await agency.getByRole("button", { name: "Déposer", exact: true }).click();
    await expect(card(agency).getByText("En revue agence")).toBeVisible();
    // Pas de publication possible avant la double validation.
    await expect(card(agency).getByRole("button", { name: `Publier ${NAME}` })).toHaveCount(0);

    await gotoMission(customer);
    await expect(customer.getByText(NAME)).toHaveCount(0);
  });

  await test.step("l'agence valide et envoie au client", async () => {
    await card(agency)
      .getByRole("button", { name: `Valider et envoyer ${NAME}` })
      .click();
    await expect(card(agency).getByText("Chez le client")).toBeVisible();
    await expect(card(agency).getByRole("button", { name: `Publier ${NAME}` })).toHaveCount(0);
  });

  await test.step("l'agence programme la publication, le client voit la date", async () => {
    await card(agency)
      .getByRole("button", { name: `Programmer la publication de ${NAME}` })
      .click();
    // Valeur proposée par défaut : demain à 10 h.
    await agency.getByRole("dialog").getByRole("button", { name: "Programmer" }).click();
    await expect(card(agency).getByText(/Publication prévue le/)).toBeVisible();

    await gotoMission(customer);
    await expect(card(customer).getByText(/Publication prévue le/)).toBeVisible();
  });

  await test.step("le client demande des corrections", async () => {
    await gotoMission(customer);
    await expect(customer.getByText(/À vous de jouer/)).toBeVisible();
    await card(customer).getByRole("button", { name: "Corrections" }).click();
    const dialog = customer.getByRole("dialog");
    await dialog.getByRole("button", { name: "Texte / orthographe" }).click();
    await dialog.getByRole("textbox").first().fill("Titre : remplacer Été par Summer");
    await dialog.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(card(customer).getByText("Vos corrections")).toBeVisible();
  });

  await test.step("l'agence voit la demande et dépose la v2", async () => {
    await gotoMission(agency);
    await expect(card(agency).getByText("À corriger")).toBeVisible();
    await expect(card(agency).getByText("Titre : remplacer Été par Summer")).toBeVisible();
    await card(agency).getByRole("button", { name: "Déposer la v2" }).click();
    const dialog = agency.getByRole("dialog");
    await dialog
      .getByLabel("Lien de la version corrigée (v2)")
      .fill("https://example.com/banniere-v2");
    await dialog.getByRole("button", { name: "Déposer la v2" }).click();
    await expect(card(agency).getByText("v2")).toBeVisible();
    await expect(card(agency).getByText("En revue agence")).toBeVisible();

    await card(agency)
      .getByRole("button", { name: `Valider et envoyer ${NAME}` })
      .click();
    await expect(card(agency).getByText("Chez le client")).toBeVisible();
  });

  await test.step("l'agence valide pour le client, puis annule (erreur de clic)", async () => {
    await card(agency)
      .getByRole("button", { name: `Valider ${NAME} pour le client` })
      .click();
    await expect(card(agency).getByText(/Validé pour le client par/)).toBeVisible();
    await card(agency)
      .getByRole("button", { name: `Annuler la validation de ${NAME} enregistrée pour le client` })
      .click();
    await agency.getByRole("dialog").getByRole("button", { name: "Annuler la validation" }).click();
    await expect(card(agency).getByText("Chez le client")).toBeVisible();
    await expect(card(agency).getByText(/Validé pour le client par/)).toHaveCount(0);
  });

  await test.step("le client valide la version corrigée", async () => {
    await gotoMission(customer);
    await expect(card(customer).getByText(/version corrigée \(v2\)/)).toBeVisible();
    await card(customer).getByRole("button", { name: "Valider", exact: true }).click();
    await expect(card(customer).getByText("Validé", { exact: true })).toBeVisible();
  });

  await test.step("l'administrateur annule la validation du client, qui revalide", async () => {
    await gotoMission(agency);
    await card(agency)
      .getByRole("button", { name: `Annuler la validation de ${NAME} enregistrée pour le client` })
      .click();
    const dialog = agency.getByRole("dialog");
    await expect(dialog.getByText(/il sera prévenu/)).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler la validation" }).click();
    await expect(card(agency).getByText("Chez le client")).toBeVisible();

    await gotoMission(customer);
    await card(customer).getByRole("button", { name: "Valider", exact: true }).click();
    await expect(card(customer).getByText("Validé", { exact: true })).toBeVisible();
  });

  await test.step("l'agence voit la validation et publie", async () => {
    await gotoMission(agency);
    await expect(card(agency).getByText("Prêt à publier")).toBeVisible();
    await expect(card(agency).getByText(/Validé par le client le/)).toBeVisible();
    await card(agency)
      .getByRole("button", { name: `Publier ${NAME}` })
      .click();
    await expect(card(agency).getByText("Publié", { exact: true })).toBeVisible();
    // Publié : la date prévue n'a plus lieu d'être affichée.
    await expect(card(agency).getByText(/Publication prévue le/)).toHaveCount(0);
  });
});
