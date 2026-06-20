import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("accueil mobile accessible sans violation axe critique", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /informations de gare/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("la recherche expose un message d'erreur accessible si l'API est indisponible", async ({ page }) => {
  await page.route("**/api/stations/search**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "API indisponible", code: "external_api" }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await expect(page.getByRole("status")).toContainText("API indisponible");
});

test("les suggestions de gares restent lisibles et sans violation axe", async ({ page }) => {
  await page.route("**/api/stations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "stop_area:SNCF:87723197",
          name: "Lyon Part Dieu",
          city: "Lyon",
          source: "sncf",
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await expect(page.getByRole("button", { name: /lyon part dieu/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).include(".suggestions").analyze();
  expect(results.violations).toEqual([]);
});
