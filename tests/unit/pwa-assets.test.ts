import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicPath = (...parts: string[]) => join(process.cwd(), "public", ...parts);

describe("PWA assets", () => {
  it("fournit un manifest installable avec des icones", () => {
    const manifest = JSON.parse(readFileSync(publicPath("manifest.webmanifest"), "utf8")) as {
      display?: string;
      icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
      name?: string;
      start_url?: string;
      theme_color?: string;
    };

    expect(manifest.name).toBe("SNCFady");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#121212");
    expect(manifest.icons?.some((icon) => icon.src === "/icons/icon-192.png" && icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.src === "/icons/icon-512.png" && icon.sizes === "512x512")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("fournit les fichiers requis par le manifest et un service worker prudent", () => {
    expect(statSync(publicPath("icons", "icon-192.png")).size).toBeGreaterThan(0);
    expect(statSync(publicPath("icons", "icon-512.png")).size).toBeGreaterThan(0);
    expect(statSync(publicPath("icons", "maskable-512.png")).size).toBeGreaterThan(0);
    expect(statSync(publicPath("icons", "apple-touch-icon.png")).size).toBeGreaterThan(0);

    const serviceWorker = readFileSync(publicPath("sw.js"), "utf8");
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain("event.respondWith(fetch(request))");
  });
});
