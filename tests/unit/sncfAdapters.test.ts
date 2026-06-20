import { describe, expect, it } from "vitest";
import { SncfBoardAdapter } from "@/infrastructure/sncfAdapters";
import { delayedDepartureFixture } from "../fixtures/sncfBoard";

describe("SncfBoardAdapter", () => {
  it("normalise un depart retarde depuis l'API SNCF", () => {
    const [item] = new SncfBoardAdapter().fromBoard(delayedDepartureFixture, "departures");

    expect(item.destination).toBe("Lyon Part Dieu");
    expect(item.trainNumber).toBe("876543");
    expect(item.status).toBe("delayed");
    expect(item.disruptions[0].title).toBe("Retard");
  });
});
