import { defineConfig, devices } from "@playwright/test";

const shellA = process.env.SHELL_A_URL ?? "http://localhost:8090";
const shellD = process.env.SHELL_D_URL ?? "http://localhost:8093";

export default defineConfig({
  testDir: "./specs",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Specs share one mock-api and its global __controls (delay, fail-next, reset), so run them serially.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: shellA,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "shell-a",
      use: { ...devices["Desktop Chrome"], baseURL: shellA },
      testMatch: /a-.*\.spec\.ts/,
    },
    {
      name: "shell-bc-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /bc-smoke\.spec\.ts/,
    },
    {
      name: "shell-d",
      use: { ...devices["Desktop Chrome"], baseURL: shellD },
      testMatch: /d-.*\.spec\.ts/,
    },
  ],
});
