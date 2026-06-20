import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("accueil mobile accessible sans violation axe critique", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /informations de gare/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("la recherche expose un message d'erreur accessible si l'API n'est pas configuree", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await expect(page.getByRole("status")).toBeVisible();
});
