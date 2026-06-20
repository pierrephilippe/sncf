import { describe, expect, it } from "vitest";
import { SncfBoardAdapter } from "@/infrastructure/sncfAdapters";
import { arrivalFixture, delayedDepartureFixture } from "../fixtures/sncfBoard";

describe("SncfBoardAdapter", () => {
  it("normalise un depart retarde depuis l'API SNCF", () => {
    const [item] = new SncfBoardAdapter().fromBoard(delayedDepartureFixture, "departures");

    expect(item.destination).toBe("Lyon Part Dieu");
    expect(item.trainNumber).toBe("876543");
    expect(item.status).toBe("delayed");
    expect(item.disruptions[0].title).toBe("Retard");
  });

  it("normalise une arrivee avec sa gare de depart", () => {
    const [item] = new SncfBoardAdapter().fromBoard(arrivalFixture, "arrivals");

    expect(item.origin).toBe("Marseille Saint-Charles");
    expect(item.destination).toBe("Cette gare");
    expect(item.trainNumber).toBe("123456");
    expect(item.status).toBe("on_time");
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
});
