import { expect, test } from "@playwright/test";
import { login } from "./utils";

/**
 * Régression : ouvrir un Dialog (Modifier/Supprimer) depuis le menu kebab
 * d'une ligne MissionsTable ne doit pas laisser la page injouable après coup
 * (bug Radix connu : `pointer-events: none` resté bloqué sur <body> quand un
 * Dialog s'ouvre dans le même tick que la fermeture du DropdownMenu).
 */
test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/missions", { waitUntil: "networkidle" });
});

test("la page reste interactive après suppression d'une mission via le menu kebab", async ({
  page,
}) => {
  const rows = page.locator("table tbody tr");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  await rows.first().getByRole("button", { name: "Actions sur la mission" }).click();
  await page.getByText("Supprimer", { exact: true }).click();
  await expect(page.getByText("Cette action est irréversible.")).toBeVisible();
  await page.getByRole("button", { name: "Confirmer" }).click();

  // La ligne doit disparaître et la liste se mettre à jour.
  await expect(rows).toHaveCount(before - 1);

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
  const rows = page.locator("table tbody tr");
  await rows.first().getByRole("button", { name: "Actions sur la mission" }).click();
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
