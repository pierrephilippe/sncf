import { describe, expect, it } from "vitest";
import { ok, type Result } from "@/domain/result";
import { SncfBoardAdapter } from "@/infrastructure/sncfAdapters";
import type { SncfHttpClient } from "@/infrastructure/sncfClient";
import { SncfBoardRepository } from "@/infrastructure/repositories";

class FakeSncfClient implements SncfHttpClient {
  public readonly calls: string[] = [];

  async get<T>(path: string): Promise<Result<T>> {
    this.calls.push(path);

    if (path.includes("/arrivals")) {
      return ok({
        arrivals: [
          {
            display_informations: {
              code: "C44",
              commercial_mode: "FLUO",
              direction: "Nancy (Nancy)",
              headsign: "836224",
            },
            stop_date_time: {
              base_arrival_date_time: "20260620T150900",
              arrival_date_time: "20260620T150900",
              links: [
                {
                  type: "stop_area",
                  rel: "origins",
                  id: "stop_area:SNCF:87141523",
                },
                {
                  type: "stop_area",
                  rel: "terminus",
                  id: "stop_area:SNCF:87141002",
                },
              ],
            },
          },
        ],
      } as T);
    }

    if (path.includes("/departures")) {
      return ok({
        departures: [
          {
            display_informations: {
              code: "C40",
              commercial_mode: "FLUO",
              direction: "Metz (Metz)",
              headsign: "837622",
            },
            stop_date_time: {
              base_departure_date_time: "20260620T153200",
              departure_date_time: "20260620T153200",
              links: [
                {
                  type: "stop_area",
                  rel: "origins",
                  id: "stop_area:SNCF:87141002",
                },
                {
                  type: "stop_area",
                  rel: "terminus",
                  id: "stop_area:SNCF:87192039",
                },
              ],
            },
          },
        ],
      } as T);
    }

    if (path.includes("87141523")) {
      return ok({
        stop_areas: [
          {
            id: "stop_area:SNCF:87141523",
            name: "Pont-Saint-Vincent",
            label: "Pont-Saint-Vincent (Pont-Saint-Vincent)",
          },
        ],
      } as T);
    }

    if (path.includes("87192039")) {
      return ok({
        stop_areas: [
          {
            id: "stop_area:SNCF:87192039",
            name: "Metz",
            label: "Metz (Metz)",
          },
        ],
      } as T);
    }

    return ok({} as T);
  }
}

describe("SncfBoardRepository", () => {
  it("résout l'origine d'une arrivée depuis le lien origins SNCF", async () => {
    const client = new FakeSncfClient();
    const repository = new SncfBoardRepository(client, new SncfBoardAdapter());

    const [arrival] = await repository.getBoard("stop_area:SNCF:87141002", "arrivals");

    expect(arrival.origin).toBe("Pont-Saint-Vincent");
    expect(arrival.destination).toBeUndefined();
    expect(client.calls).toContain("/coverage/sncf/stop_areas/stop_area%3ASNCF%3A87141523");
  });

  it("résout la destination d'un départ depuis le lien terminus SNCF sans renseigner l'origine", async () => {
    const client = new FakeSncfClient();
    const repository = new SncfBoardRepository(client, new SncfBoardAdapter());

    const [departure] = await repository.getBoard("stop_area:SNCF:87141002", "departures");

    expect(departure.destination).toBe("Metz");
    expect(departure.origin).toBeUndefined();
    expect(client.calls).toContain("/coverage/sncf/stop_areas/stop_area%3ASNCF%3A87192039");
  });
});
