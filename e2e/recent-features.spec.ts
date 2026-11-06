import { expect, test, type Browser, type Page } from "@playwright/test";
import { api, apiLogin, openSession, seedClientMission, type Tokens } from "./api";
import { DEMO_ACCOUNTS } from "./utils";

/**
 * Parcours ajoutés récemment, à l'écran, côté agence et côté client :
 * livrable « Document », calendriers (client et filtre par collaborateur),
 * mentions dans la discussion, équipe du client.
 *
 * Une seule chaîne de données (entreprise, compte client, projet, mission)
 * préparée par l'API et supprimée à la fin ; deux connexions seulement
 * (limite serveur de 10/min), les sessions sont ouvertes avec les jetons.
 */

test.describe.configure({ mode: "serial" });

const DOC = "Charte E2E";

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
  const page = await (await browser.newContext()).newPage();
  await openSession(page, tokens);
  return page;
}

const docCard = (page: Page) => page.locator('[id^="livrable-"]', { hasText: DOC });

test("un document est transmis au client, sans validation ni publication", async ({ browser }) => {
  const agency = await openAs(browser, admin);
  await agency.goto(`/missions/${seed.missionId}`, { waitUntil: "networkidle" });
  await agency.getByRole("radio", { name: /Document/ }).click();
  await agency.getByPlaceholder(/Nom du livrable/).fill(DOC);
  await agency.getByPlaceholder(/https/).first().fill("https://example.com/charte.pdf");
  await agency.getByRole("button", { name: "Déposer" }).click();
  await expect(docCard(agency).getByText("Document ·")).toBeVisible();

  await docCard(agency)
    .getByRole("button", { name: `Valider et envoyer ${DOC}` })
    .click();
  await expect(docCard(agency).getByText("Transmis au client")).toBeVisible();
  // Un document ne se programme ni ne se publie.
  await expect(docCard(agency).getByRole("button", { name: /Programmer/ })).toHaveCount(0);
  await expect(docCard(agency).getByRole("button", { name: /^Publier/ })).toHaveCount(0);

  const customer = await openAs(browser, client);
  await customer.goto(`/missions/${seed.missionId}`, { waitUntil: "networkidle" });
  await expect(customer.getByText("Document transmis").first()).toBeVisible();
  await expect(customer.getByRole("button", { name: /^Valider/ })).toHaveCount(0);
});

test("le calendrier du client ne montre que ses propres filtres", async ({ browser }) => {
  const customer = await openAs(browser, client);
  await customer.goto("/calendrier", { waitUntil: "networkidle" });
  await expect(customer.getByRole("button", { name: "Livrable disponible" })).toBeVisible();
  await expect(customer.getByRole("combobox", { name: "Filtrer par client" })).toHaveCount(0);
  await expect(customer.getByRole("combobox", { name: "Filtrer par collaborateur" })).toHaveCount(
    0,
  );
  await customer.getByRole("button", { name: "Agenda" }).click();
  // Le document transmis est disponible pour lui.
  await expect(customer.getByText(DOC).first()).toBeVisible();
});

test("l'agence filtre son calendrier par collaborateur", async ({ browser }) => {
  const agency = await openAs(browser, admin);
  await agency.goto("/calendrier", { waitUntil: "networkidle" });
  await agency.getByRole("button", { name: "Agenda" }).click();
  // La mission préparée a pour responsable le compte admin de démo.
  await agency.getByRole("combobox", { name: "Filtrer par collaborateur" }).selectOption({
    label: "Admin E2E",
  });
  await expect(agency).toHaveURL(/collab=/);
  await expect(agency.getByText(seed.title).first()).toBeVisible();
});

test("une mention ne propose le client que si le message lui est visible", async ({
  browser,
  request,
}) => {
  const agency = await openAs(browser, admin);
  await agency.goto(`/missions/${seed.missionId}`, { waitUntil: "networkidle" });
  const box = agency.getByPlaceholder(/pour mentionner/);

  // Note interne : le client n'est jamais proposé.
  await box.click();
  await box.pressSequentially("Note @Cli");
  await expect(agency.getByRole("option", { name: /Client E2E/ })).toHaveCount(0);
  await box.fill("");

  // Message visible du client : il peut être mentionné, et il est prévenu.
  await agency.getByRole("checkbox").first().check();
  await box.pressSequentially("Bonjour @Cli");
  await agency.getByRole("option", { name: /Client E2E/ }).click();
  await box.pressSequentially("merci de valider.");
  await agency.getByRole("button", { name: "Envoyer" }).click();
  await expect(agency.getByText("Commentaire publié.")).toBeVisible();
  await expect(agency.locator("li span.text-primary", { hasText: "@Client E2E" })).toBeVisible();

  const notifications = await api<{ title: string }[]>(
    request,
    client.access,
    "GET",
    "/notifications/",
  );
  expect(notifications.some((n) => n.title.startsWith("Admin E2E vous a mentionné"))).toBe(true);
});

test("l'agence voit l'équipe du client sur sa fiche", async ({ browser }) => {
  const agency = await openAs(browser, admin);
  await agency.goto(`/clients/${seed.companyId}`, { waitUntil: "networkidle" });
  await agency.getByRole("button", { name: /Équipe du client/ }).click();
  await expect(agency.getByText(/Client E2E/).first()).toBeVisible();
  await expect(agency.getByRole("button", { name: "Ajouter une personne" })).toBeVisible();
});
