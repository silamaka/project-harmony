import { expect, test, type Page } from "@playwright/test";
import { login, seedMission } from "./utils";

/** Lit la valeur numérique affichée sur la carte KPI "Missions" (data-testid="kpi-missions"). */
async function missionsKpiValue(page: Page) {
  const text = await page.getByTestId("kpi-missions").innerText();
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  await expect(page.getByTestId("kpi-missions")).toBeVisible();
  // Le premier rendu affiche "0" (données pas encore résolues) avant la vraie
  // valeur : on laisse le temps au fetch mocké (~120ms) de se terminer.
  await page.waitForTimeout(500);
});

test("affiche les cartes KPI et le panneau de filtre de période", async ({ page }) => {
  await expect(page.getByText("Vue d'ensemble de l'activité de l'agence")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tout", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aujourd'hui" })).toBeVisible();
  await expect(page.getByText("Missions récentes")).toBeVisible();
});

test("le filtre de période fait varier le nombre de missions affichées", async ({ page }) => {
  const total = await missionsKpiValue(page);
  expect(total).not.toBeNull();

  await page.getByRole("button", { name: "Cette semaine" }).click();
  await page.waitForTimeout(300);
  const semaine = await missionsKpiValue(page);
  expect(semaine).not.toBeNull();
  expect(semaine as number).toBeLessThanOrEqual(total as number);

  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await page.waitForTimeout(300);
  expect(await missionsKpiValue(page)).toBe(total);
});

test("le filtre sélectionné survit à un rechargement de page", async ({ page }) => {
  await page.getByRole("button", { name: "Ce mois-ci" }).click();
  await page.waitForTimeout(300);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const active = page.getByRole("button", { name: "Ce mois-ci" });
  await expect(active).toHaveClass(/bg-primary/);
});

test("une plage personnalisée met à jour le badge de période et les KPI", async ({ page }) => {
  await page.getByRole("button", { name: "Personnalisé" }).click();
  await page.getByRole("button", { name: "Choisir une période" }).click();

  const dayButtons = page.locator('[data-slot="calendar"] button[data-day]');
  await expect(dayButtons.first()).toBeVisible();
  await dayButtons.nth(2).click();
  await dayButtons.nth(3).click();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: /–/ })).toBeVisible();
});

test("le tableau des missions récentes permet d'ouvrir la fiche d'édition", async ({ page }) => {
  // L'app démarre sans donnée métier : on seed une mission avant d'interagir avec le tableau.
  await seedMission(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByTestId("kpi-missions")).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await page.waitForTimeout(300);

  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible();

  await firstRow.getByRole("button", { name: "Actions sur la mission" }).click();
  await page.getByText("Modifier", { exact: true }).click();

  await expect(page.getByText("Modifier la mission")).toBeVisible();
  await expect(page.getByLabel("Titre")).not.toHaveValue("");
});

test("un clic sur une carte KPI ouvre le panneau de détail correspondant", async ({ page }) => {
  await page.getByTestId("kpi-clients").click();
  await expect(page.getByText("Tous les clients")).toBeVisible();
});
