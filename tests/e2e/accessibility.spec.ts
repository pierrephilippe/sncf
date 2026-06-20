import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("accueil mobile accessible sans violation axe critique", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Nom de gare")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Methode de recherche" })).toBeVisible();

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

  await expect(page.getByRole("list", { name: "Suggestions de gares" })).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Lyon Part Dieu" })).toBeVisible();
});

test("une gare selectionnee peut etre ajoutee aux favoris depuis l'en-tete", async ({ page }) => {
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

  const addFavoriteButton = page.getByRole("button", { name: "Ajouter Lyon Part Dieu aux favoris" });
  await expect(addFavoriteButton).toBeVisible();
  await addFavoriteButton.click();
  await expect(addFavoriteButton).not.toBeVisible();

  await page.getByRole("button", { name: "Supprimer la gare selectionnee" }).click();
  await page.getByRole("tab", { name: "Favoris" }).click();
  await expect(page.getByRole("button", { name: "Lyon Part Dieu", exact: true })).toBeVisible();
});

test("les boutons de recherche basculent entre saisie, autour et favoris", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("tablist", { name: "Methode de recherche" })).toBeVisible();
  await expect(page.getByLabel("Nom de gare")).toBeVisible();

  await page.getByRole("tab", { name: "Autour" }).click();
  await expect(page.getByRole("button", { name: "Rechercher autour de moi" })).toBeVisible();
  await expect(page.getByLabel("Nom de gare")).not.toBeVisible();

  await page.getByRole("tab", { name: "Favoris" }).click();
  await expect(page.getByText("Aucune gare favorite.")).toBeVisible();

  await page.getByRole("tab", { name: "Saisie" }).click();
  await expect(page.getByLabel("Nom de gare")).toBeVisible();
});

test("les onglets conservent des informations distinctes pour departs et arrivees", async ({ page }) => {
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
    const type = new URL(route.request().url()).searchParams.get("type");
    const body = type === "arrivals"
      ? [
          {
            id: "arrival-1",
            time: "2026-06-20T16:05:00+01:00",
            destination: "Cette gare",
            origin: "Marseille Saint-Charles",
            line: "TGV INOUI",
            trainNumber: "123456",
            platform: "4",
            status: "on_time",
            disruptions: [],
          },
        ]
      : [
          {
            id: "departure-1",
            time: "2026-06-20T14:08:00+01:00",
            destination: "Paris Gare de Lyon",
            line: "TER",
            trainNumber: "876543",
            platform: "2",
            status: "on_time",
            disruptions: [],
          },
        ];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();

  await expect(page.getByText("Paris Gare de Lyon", { exact: true })).toBeVisible();
  await expect(page.getByText("Marseille Saint-Charles", { exact: true })).not.toBeVisible();

  await page.getByRole("tab", { name: "Arrivees" }).click();
  await expect(page.getByText("Marseille Saint-Charles", { exact: true })).toBeVisible();
  await expect(page.getByText("Depart Marseille Saint-Charles")).toBeVisible();
  await expect(page.getByText("Paris Gare de Lyon", { exact: true })).not.toBeVisible();

  await page.getByRole("tab", { name: "Departs" }).click();
  await expect(page.getByText("Paris Gare de Lyon", { exact: true })).toBeVisible();
  await expect(page.getByText("Marseille Saint-Charles", { exact: true })).not.toBeVisible();
});

test("un rechargement navigateur conserve la gare et l'onglet courant", async ({ page }) => {
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
    const type = new URL(route.request().url()).searchParams.get("type");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: type === "arrivals" ? "arrival-restore" : "departure-restore",
          time: "2026-06-20T16:05:00+02:00",
          destination: type === "arrivals" ? "Cette gare" : "Paris Gare de Lyon",
          origin: type === "arrivals" ? "Marseille Saint-Charles" : undefined,
          line: "TGV INOUI",
          trainNumber: "123456",
          platform: "4",
          status: "on_time",
          disruptions: [],
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();
  await page.getByRole("tab", { name: "Arrivees" }).click();
  await expect(page.getByText("Marseille Saint-Charles", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Lyon Part Dieu" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Arrivees" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Marseille Saint-Charles", { exact: true })).toBeVisible();
});

test("les departs se chargent depuis maintenant moins cinq minutes avec pagination", async ({ page }) => {
  const requestedPages: string[] = [];
  const requestedFromDateTimes: Array<string | null> = [];

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
    const url = new URL(route.request().url());
    const pageNumber = url.searchParams.get("page") ?? "0";
    requestedPages.push(pageNumber);
    requestedFromDateTimes.push(url.searchParams.get("fromDateTime"));

    const startIndex = pageNumber === "0" ? 0 : 20;
    const length = pageNumber === "0" ? 20 : 2;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        Array.from({ length }, (_, index) => ({
          id: `departure-${startIndex + index}`,
          time: "2026-06-20T14:08:00+02:00",
          destination: `Destination ${startIndex + index + 1}`,
          line: "TER",
          trainNumber: `87${startIndex + index}`,
          platform: "2",
          status: "on_time",
          disruptions: [],
        })),
      ),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();

  await expect(page.getByText("Destination 1", { exact: true })).toBeVisible();
  expect(requestedPages[0]).toBe("0");
  expect(requestedFromDateTimes[0]).toBeTruthy();

  await page.getByRole("button", { name: "Charger plus" }).click();
  await expect(page.getByText("Destination 22", { exact: true })).toBeVisible();
  await expect(page.getByText("Tous les resultats disponibles sont affiches.")).toBeVisible();
  expect(requestedPages).toContain("1");
  expect(requestedFromDateTimes[1]).toBe(requestedFromDateTimes[0]);
});

test("un train peut etre suivi puis actualise sur une page dediee", async ({ page }) => {
  let boardCalls = 0;

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
    boardCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "departure-1",
          time: "2026-06-20T14:08:00+02:00",
          expectedTime: boardCalls > 1 ? "2026-06-20T14:18:00+02:00" : undefined,
          destination: "Paris Gare de Lyon",
          servedStations: ["Lyon Part Dieu", "Dijon Ville", "Paris Gare de Lyon"],
          line: "TER",
          trainNumber: "876543",
          platform: boardCalls > 1 ? "7" : "2",
          status: boardCalls > 1 ? "delayed" : "on_time",
          disruptions: boardCalls > 1
            ? [
                {
                  id: "delay-1",
                  title: "Retard",
                  message: "Retard estime a 10 minutes.",
                },
              ]
            : [],
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();

  await page.getByRole("button", { name: "Suivre le train 876543" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "TER - Train 876543" })).toBeVisible();
  await expect(page.locator(".tracking-route-cards").getByText("Lyon Part Dieu")).toBeVisible();
  await expect(page.locator(".tracking-route-cards").getByText("Arrivee")).toBeVisible();
  await expect(page.locator(".tracking-route-cards").getByText("Paris Gare de Lyon")).toBeVisible();
  await expect(page.getByText(/Derniere actualisation/)).toBeVisible();
  await expect(page.getByLabel("Heure de depart")).toContainText("14:08");
  await expect(page.getByLabel("Voie du train")).toContainText("2");
  await expect(page.getByLabel("Statut du train")).toContainText("A l'heure");
  await expect(page.getByText("Dijon Ville")).toBeVisible();
  await expect(page.getByRole("region", { name: "Plan voitures et reperes" })).not.toBeVisible();

  await page.getByRole("button", { name: "Actualiser" }).click();
  const importantInformation = page.getByRole("region", { name: "Informations importantes du train" });
  await expect(importantInformation).toBeVisible();
  await expect(importantInformation).toContainText("Retard");
  await expect(importantInformation).toContainText("Retard estime : 10 minutes.");
  await expect(importantInformation).toContainText("Retard estime a 10 minutes.");
  await expect(page.getByLabel("Heure de depart")).toContainText("Depart retarde");
  await expect(page.getByLabel("Heure de depart")).toContainText("14:08");
  await expect(page.getByLabel("Heure de depart")).toContainText("14:18");
  await expect(page.getByLabel("Voie du train")).toContainText("7");

  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("button", { name: "Suivre le train 876543" })).toBeVisible();
});

test("une erreur d'actualisation du train suivi reste visible sur la page detail", async ({ page }) => {
  let boardCalls = 0;

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
    boardCalls += 1;
    if (boardCalls > 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "API SNCF indisponible", code: "external_api" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "departure-error",
          time: "2026-06-20T14:08:00+02:00",
          destination: "Paris Gare de Lyon",
          line: "TER",
          trainNumber: "876543",
          platform: "2",
          status: "on_time",
          disruptions: [],
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();
  await page.getByRole("button", { name: "Suivre le train 876543" }).click();
  await expect(page.getByText(/Derniere actualisation/)).toBeVisible();

  await page.getByRole("button", { name: "Actualiser" }).click();

  const updateError = page.getByRole("alert", { name: "Erreur de mise a jour" });
  await expect(updateError).toBeVisible();
  await expect(updateError).toContainText("Actualisation impossible");
  await expect(updateError).toContainText("API SNCF indisponible");
  await expect(updateError).toContainText("Les informations affichees ne sont pas confirmees");
});

test("un rechargement navigateur conserve la page detail du train suivi", async ({ page }) => {
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
      body: JSON.stringify([
        {
          id: "departure-reload",
          time: "2026-06-20T14:08:00+02:00",
          destination: "Paris Gare de Lyon",
          servedStations: ["Lyon Part Dieu", "Paris Gare de Lyon"],
          line: "TER",
          trainNumber: "876543",
          platform: "2",
          status: "on_time",
          disruptions: [],
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();
  await page.getByRole("button", { name: "Suivre le train 876543" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "TER - Train 876543" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Lyon Part Dieu" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "TER - Train 876543" })).toBeVisible();
  await expect(page.getByLabel("Heure de depart")).toContainText("14:08");
  await expect(page.getByRole("tab", { name: "Departs" })).not.toBeVisible();
});

test("la page detail n'affiche pas une arrivee identique a la gare selectionnee", async ({ page }) => {
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
      body: JSON.stringify([
        {
          id: "departure-same-station",
          time: "2026-06-20T14:08:00+02:00",
          destination: "Lyon Part-Dieu (Lyon)",
          line: "TGV INOUI",
          trainNumber: "876543",
          platform: "2",
          status: "on_time",
          disruptions: [],
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Lyon");
  await page.getByRole("button", { name: /lyon part dieu/i }).click();
  await page.getByRole("button", { name: "Suivre le train 876543" }).click();

  const routeCards = page.locator(".tracking-route-cards");
  await expect(routeCards.getByText("Depart")).toBeVisible();
  await expect(routeCards.getByText("Lyon Part Dieu")).toBeVisible();
  await expect(routeCards.getByText("Arrivee")).toBeVisible();
  await expect(routeCards.getByText("Non communique")).toBeVisible();
  await expect(routeCards.getByText("Lyon Part-Dieu (Lyon)")).not.toBeVisible();
});

test("un libelle de trajet sert au trajet mais pas au nom du train", async ({ page }) => {
  await page.route("**/api/stations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "stop_area:SNCF:87113001",
          name: "Frankfurt am Main Hbf",
          city: "Frankfurt",
          source: "sncf",
        },
      ]),
    });
  });

  await page.route("**/api/stations/*/board**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "departure-route-label",
          time: "2026-06-20T14:08:00+02:00",
          destination: "Non communique",
          routeLabel: "Frankfurt am Main Hbf - Paris Est",
          trainNumber: "9560",
          platform: "2",
          status: "on_time",
          disruptions: [],
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByLabel("Nom de gare").fill("Frankfurt");
  await page.getByRole("button", { name: /frankfurt am main hbf/i }).click();
  await page.getByRole("button", { name: "Suivre le train 9560" }).click();

  const routeCards = page.locator(".tracking-route-cards");
  await expect(routeCards.getByText("Frankfurt am Main Hbf")).toBeVisible();
  await expect(routeCards.getByText("Paris Est")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Train 9560" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).not.toContainText("Frankfurt am Main Hbf - Paris Est");
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
  await expect(page.getByRole("heading", { level: 1, name: "Lyon Part Dieu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();

  await page.mouse.wheel(0, 900);
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Departs" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Arrivees" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Annonces" })).toBeVisible();
  await expect(page.getByText("Lyon Part Dieu").first()).toBeVisible();

  await expect(page.getByRole("heading", { level: 1, name: "Lyon Part Dieu" })).toBeVisible();
});
