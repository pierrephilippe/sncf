import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("accueil mobile accessible sans violation axe critique", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Nom de gare")).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();

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

test("une panne reseau affiche un message francais explicite", async ({ page }) => {
  await page.route("**/api/stations/search**", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await expect(page.getByRole("status")).toContainText("Connexion impossible");
  await expect(page.getByRole("status")).not.toContainText("Failed to fetch");
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

test("les suggestions disparaissent apres selection d'une gare", async ({ page }) => {
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

  await page.route("**/api/stations/*/board**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();

  await expect(page.getByRole("button", { name: /lyon part dieu/i })).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Lyon Part Dieu" })).toBeVisible();
});

test("le menu fixe reste stable au scroll avec la barre d'actions", async ({ page }) => {
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

  await page.route("**/api/stations/*/board**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        Array.from({ length: 18 }, (_, index) => ({
          id: `train-${index}`,
          time: "2026-06-20T12:00:00+01:00",
          destination: `Destination ${index + 1}`,
          line: "TER",
          trainNumber: `87${index}`,
          platform: String((index % 6) + 1),
          status: "on_time",
          disruptions: [],
        })),
      ),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Lyon Part Dieu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();

  await page.mouse.wheel(0, 900);
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Departs" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Arrivees" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Annonces" })).toBeVisible();
  await expect(page.getByText("Lyon Part Dieu").first()).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: "Autour" })).toBeVisible();
});
