import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Netlify headers", () => {
  it("declare une Content Security Policy restrictive", () => {
    const netlifyConfig = readFileSync(join(process.cwd(), "netlify.toml"), "utf8");

    expect(netlifyConfig).toContain("Content-Security-Policy");
    expect(netlifyConfig).toContain("default-src 'self'");
    expect(netlifyConfig).toContain("connect-src 'self'");
    expect(netlifyConfig).toContain("frame-ancestors 'none'");
  });
});
