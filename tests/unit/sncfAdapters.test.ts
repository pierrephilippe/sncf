import { describe, expect, it } from "vitest";
import { SncfBoardAdapter } from "@/infrastructure/sncfAdapters";
import { arrivalFixture, delayedDepartureFixture } from "../fixtures/sncfBoard";

describe("SncfBoardAdapter", () => {
  it("normalise un départ retardé depuis l'API SNCF", () => {
    const [item] = new SncfBoardAdapter().fromBoard(delayedDepartureFixture, "departures");

    expect(item.destination).toBe("Lyon Part Dieu");
    expect(item.origin).toBeUndefined();
    expect(item.trainNumber).toBe("876543");
    expect(item.status).toBe("delayed");
    expect(item.disruptions[0].title).toBe("Retard");
  });

  it("interprete les horaires SNCF d'ete comme des heures de Paris", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: { code: "876543", direction: "Paris Gare de Lyon" },
            stop_date_time: {
              base_departure_date_time: "20260620T140800",
              departure_date_time: "20260620T140800",
            },
          },
        ],
      },
      "departures",
    );

    expect(item.time).toBe("2026-06-20T12:08:00.000Z");
  });

  it("interprete les horaires SNCF d'hiver comme des heures de Paris", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: { code: "876543", direction: "Paris Gare de Lyon" },
            stop_date_time: {
              base_departure_date_time: "20260120T140800",
              departure_date_time: "20260120T140800",
            },
          },
        ],
      },
      "departures",
    );

    expect(item.time).toBe("2026-01-20T13:08:00.000Z");
  });

  it("normalise une arrivée sans inventer la gare de départ depuis la direction", () => {
    const [item] = new SncfBoardAdapter().fromBoard(arrivalFixture, "arrivals");

    expect(item.origin).toBeUndefined();
    expect(item.destination).toBeUndefined();
    expect(item.line).toBe("TGV INOUI");
    expect(item.trainNumber).toBe("123456");
    expect(item.status).toBe("on_time");
  });

  it("utilise la première gare desservie comme origine d'une arrivée quand elle est fournie", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        arrivals: [
          {
            display_informations: {
              code: "123456",
              direction: "Nancy",
            },
            stop_date_time: {
              base_arrival_date_time: "20260620T160500",
              arrival_date_time: "20260620T160500",
            },
            route: {
              stop_points: [
                { name: "Marseille Saint-Charles" },
                { name: "Avignon TGV" },
                { name: "Nancy" },
              ],
            },
          },
        ],
      },
      "arrivals",
    );

    expect(item.origin).toBe("Marseille Saint-Charles");
  });

  it("genere des identifiants uniques si deux trains partagent le meme code et horaire", () => {
    const [firstItem, secondItem] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: { code: "A", direction: "Paris" },
            stop_date_time: {
              base_departure_date_time: "20260620T120300",
              departure_date_time: "20260620T120300",
            },
          },
          {
            display_informations: { code: "A", direction: "Lyon" },
            stop_date_time: {
              base_departure_date_time: "20260620T120300",
              departure_date_time: "20260620T120300",
            },
          },
        ],
      },
      "departures",
    );

    expect(firstItem.id).not.toBe(secondItem.id);
  });

  it("extrait les gares desservies si elles sont presentes dans la reponse SNCF", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: { code: "876543", direction: "Paris Gare de Lyon" },
            stop_date_time: {
              base_departure_date_time: "20260620T140800",
              departure_date_time: "20260620T140800",
            },
            route: {
              stop_points: [
                { name: "Lyon Part Dieu" },
                { name: "Dijon Ville" },
                { name: "Paris Gare de Lyon" },
              ],
            },
          },
        ],
      },
      "departures",
    );

    expect(item.servedStations).toEqual(["Lyon Part Dieu", "Dijon Ville", "Paris Gare de Lyon"]);
  });

  it("conserve les gares desservies pour une arrivee si elles sont presentes", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        arrivals: [
          {
            display_informations: { code: "123456", direction: "Lyon Part Dieu" },
            stop_date_time: {
              base_arrival_date_time: "20260620T160500",
              arrival_date_time: "20260620T160500",
            },
            route: {
              stop_points: [
                { name: "Marseille Saint-Charles" },
                { name: "Avignon TGV" },
                { name: "Lyon Part Dieu" },
              ],
            },
          },
        ],
      },
      "arrivals",
    );

    expect(item.servedStations).toEqual(["Marseille Saint-Charles", "Avignon TGV", "Lyon Part Dieu"]);
  });

  it("ne confond pas un libelle de trajet avec le type du train", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: {
              code: "9560",
              label: "Frankfurt am Main Hbf - Paris Est",
              direction: "Paris Est",
            },
            stop_date_time: {
              base_departure_date_time: "20260620T140800",
              departure_date_time: "20260620T140800",
            },
          },
        ],
      },
      "departures",
    );

    expect(item.line).toBeUndefined();
    expect(item.routeLabel).toBe("Frankfurt am Main Hbf - Paris Est");
  });

  it("utilise commercial_mode comme type du train quand il est fourni", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: {
              code: "9560",
              commercial_mode: "TGV INOUI",
              direction: "Paris Est",
            },
            stop_date_time: {
              base_departure_date_time: "20260620T140800",
              departure_date_time: "20260620T140800",
            },
          },
        ],
      },
      "departures",
    );

    expect(item.line).toBe("TGV INOUI");
    expect(item.routeLabel).toBeUndefined();
  });

  it("conserve l'identifiant vehicle_journey quand l'API le fournit", () => {
    const [item] = new SncfBoardAdapter().fromBoard(
      {
        departures: [
          {
            display_informations: {
              code: "9560",
              direction: "Paris Est",
            },
            stop_date_time: {
              base_departure_date_time: "20260620T140800",
              departure_date_time: "20260620T140800",
              links: [
                { type: "vehicle_journey", id: "vehicle_journey:SNCF:9560" },
              ],
            },
          },
        ],
      },
      "departures",
    );

    expect(item.vehicleJourneyId).toBe("vehicle_journey:SNCF:9560");
  });

  it("extrait les gares desservies depuis le detail vehicle_journey", () => {
    const details = new SncfBoardAdapter().fromVehicleJourney({
      vehicle_journeys: [
        {
          stop_times: [
            { stop_point: { name: "Frankfurt am Main Hbf" } },
            { stop_point: { name: "Mannheim Hbf" } },
            { stop_point: { name: "Paris Est" } },
          ],
        },
      ],
    });

    expect(details.servedStations).toEqual([
      "Frankfurt am Main Hbf",
      "Mannheim Hbf",
      "Paris Est",
    ]);
  });
});
