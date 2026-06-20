import { spawn } from "node:child_process";
import { chromium } from "playwright";

const child = spawn("npx", ["lhci", "autorun", "--config=./lighthouserc.cjs"], {
  env: {
    ...process.env,
    CHROME_PATH: chromium.executablePath(),
  },
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
