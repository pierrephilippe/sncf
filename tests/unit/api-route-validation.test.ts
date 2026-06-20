import { describe, expect, it, vi } from "vitest";
import { GET as nearbyStations } from "@/app/api/stations/nearby/route";
import { GET as searchStations } from "@/app/api/stations/search/route";
import { jsonResponse } from "@/app/api/_shared/http";
import { checkRateLimit } from "@/app/api/_shared/rateLimit";

const appMock = vi.hoisted(() => ({
  searchStations: { execute: vi.fn() },
  findNearbyStations: { execute: vi.fn() },
}));

vi.mock("@/infrastructure/container", () => ({
  createApplication: () => appMock,
}));

describe("stations search route", () => {
  it("rejette une recherche trop courte sans appeler l'API externe", async () => {
    const response = await searchStations(new Request("http://localhost/api/stations/search?q=a"));
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("bad_request");
  });

  it("rejette une recherche trop longue", async () => {
    const response = await searchStations(new Request(`http://localhost/api/stations/search?q=${"a".repeat(81)}`));
    const body = (await response.json()) as { code: string; error: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("bad_request");
    expect(body.error).toContain("80");
    expect(appMock.searchStations.execute).not.toHaveBeenCalled();
  });

  it("rejette les coordonnees non finies ou hors bornes", async () => {
    const notFinite = await nearbyStations(new Request("http://localhost/api/stations/nearby?lat=Infinity&lon=2"));
    const outOfRange = await nearbyStations(new Request("http://localhost/api/stations/nearby?lat=48&lon=181"));

    expect(notFinite.status).toBe(400);
    expect(outOfRange.status).toBe(400);
    expect(appMock.findNearbyStations.execute).not.toHaveBeenCalled();
  });

  it("desactive le cache public pour la recherche geolocalisee", async () => {
    appMock.findNearbyStations.execute.mockResolvedValueOnce([]);

    const response = await nearbyStations(new Request("http://localhost/api/stations/nearby?lat=48.85&lon=2.35"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  });

  it("limite le debit par IP et par route", () => {
    const request = new Request("http://localhost/api/stations/search?q=paris", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let index = 0; index < 60; index += 1) {
      expect(checkRateLimit(request, 1_000)).toBeNull();
    }

    const blocked = checkRateLimit(request, 1_000);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("60");
  });

  it("permet de desactiver le cache pour les donnees temps reel", () => {
    const response = jsonResponse({ ok: true }, 200, 0);

    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});
