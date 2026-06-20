import { describe, expect, it } from "vitest";
import { getServerConfig } from "@/infrastructure/config";

describe("server config", () => {
  it("autorise une base URL injectee hors production", () => {
    const config = getServerConfig({
      NODE_ENV: "test",
      SNCF_API_BASE_URL: "http://localhost:3001/sncf/",
      SNCF_API_TOKEN: "token",
    });

    expect(config.SNCF_API_BASE_URL).toBe("http://localhost:3001/sncf");
  });

  it("refuse une base URL non SNCF en production", () => {
    expect(() => getServerConfig({
      NODE_ENV: "production",
      SNCF_API_BASE_URL: "https://example.com/v1",
      SNCF_API_TOKEN: "token",
    })).toThrow(/api\.sncf\.com\/v1/);
  });

  it("autorise uniquement la base SNCF officielle en production", () => {
    const config = getServerConfig({
      NODE_ENV: "production",
      SNCF_API_BASE_URL: "https://api.sncf.com/v1/",
      SNCF_API_TOKEN: "token",
    });

    expect(config.SNCF_API_BASE_URL).toBe("https://api.sncf.com/v1");
  });
});
