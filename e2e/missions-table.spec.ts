import { expect, test } from "@playwright/test";
import { login, seedMission } from "./utils";

/**
 * Régression : ouvrir un Dialog (Modifier/Supprimer) depuis le menu kebab
 * d'une ligne MissionsTable ne doit pas laisser la page injouable après coup
 * (bug Radix connu : `pointer-events: none` resté bloqué sur <body> quand un
 * Dialog s'ouvre dans le même tick que la fermeture du DropdownMenu).
 *
 * Le backend ne pré-remplit pas de missions de test, mais peut contenir des
 * données de démo persistantes : chaque test seed sa propre mission plutôt
 * que de dépendre d'un jeu de données pré-rempli, et cible sa ligne par
 * titre plutôt que par position.
 */
let seeded: { title: string };

test.beforeEach(async ({ page }) => {
  await login(page);
  seeded = await seedMission(page);
});

test("la page reste interactive après suppression d'une mission via le menu kebab", async ({
  page,
}) => {
  // Le tableau trie par deadline ; plusieurs missions peuvent partager la même
  // échéance (celle par défaut du formulaire). On cible donc la ligne de la
  // mission seedée par son titre plutôt que rows.first(), qui n'est fiable que
  // si c'est la seule ligne présente.
  const row = page.locator("table tbody tr", { hasText: seeded.title });
  await expect(page.getByText(seeded.title)).toBeVisible();

  await row.getByRole("button", { name: "Actions sur la mission" }).click();
  await page.getByText("Supprimer", { exact: true }).click();
  await expect(page.getByText("Cette action est irréversible.")).toBeVisible();
  await page.getByRole("button", { name: "Confirmer" }).click();

  // La mission seedée doit disparaître (d'autres missions, démo ou d'autres
  // tests, peuvent rester dans le tableau : ne pas supposer qu'il est vide).
  await expect(page.getByText(seeded.title)).not.toBeVisible();
  await expect(row).toHaveCount(0);

  // Le body ne doit plus être verrouillé par un overlay Radix fantôme.
  const pointerEvents = await page.evaluate(() => document.body.style.pointerEvents);
  expect(pointerEvents).not.toBe("none");

  // La page doit rester réellement cliquable : la recherche doit fonctionner.
  const search = page.getByPlaceholder("Rechercher une mission...");
  await search.click();
  await search.fill("zzz-inexistant-zzz");
  await expect(page.getByText("Aucune mission.")).toBeVisible({ timeout: 5000 });
});

test("la page reste interactive après ouverture puis annulation de la modification d'une mission", async ({
  page,
}) => {
  const row = page.locator("table tbody tr", { hasText: seeded.title });
  await row.getByRole("button", { name: "Actions sur la mission" }).click();
  await page.getByText("Modifier", { exact: true }).click();

  await expect(page.getByText("Modifier la mission")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Modifier la mission")).not.toBeVisible();

  const pointerEvents = await page.evaluate(() => document.body.style.pointerEvents);
  expect(pointerEvents).not.toBe("none");

  const search = page.getByPlaceholder("Rechercher une mission...");
  await search.click();
  await search.fill("zzz-inexistant-zzz");
  await expect(page.getByText("Aucune mission.")).toBeVisible({ timeout: 5000 });
});
