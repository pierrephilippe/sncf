import { spawn } from "node:child_process";

const child = spawn(
  "npx",
  ["playwright", "test", "tests/e2e/accessibility.spec.ts", "--project=mobile-chrome"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
