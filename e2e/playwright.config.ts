import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  outputDir: process.env.OPENSKY_E2E_ARTIFACT_DIR
    ? join(process.env.OPENSKY_E2E_ARTIFACT_DIR, "playwright-results")
    : join(tmpdir(), `opensky-playwright-results-${process.pid}`),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    trace: "retain-on-failure",
  },
});
