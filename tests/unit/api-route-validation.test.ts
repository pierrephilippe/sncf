import { describe, expect, it } from "vitest";
import { GET as searchStations } from "@/app/api/stations/search/route";
import { jsonResponse } from "@/app/api/_shared/http";

describe("stations search route", () => {
  it("rejette une recherche trop courte sans appeler l'API externe", async () => {
    const response = await searchStations(new Request("http://localhost/api/stations/search?q=a"));
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("bad_request");
  });

  it("permet de desactiver le cache pour les donnees temps reel", () => {
    const response = jsonResponse({ ok: true }, 200, 0);

    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});
