import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl as testDatabaseUrlFrom } from "./tests/setup/test-db-url";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const testDatabaseUrl = testDatabaseUrlFrom();

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  // No retries: auth.spec is one serial, stateful story; a retry re-runs
  // against used invites and locks and hides the real failure.
  retries: 0,
  reporter: [["list"]],
  outputDir: ".context/playwright",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure", locale: "en-US" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-360",
      dependencies: ["desktop"],
      testMatch: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } },
    },
  ],
  // Runs the production build (`pnpm build` first — test:e2e does it) against
  // the _test database, so it never touches dev data or the dev server.
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: false,
    stdout: "ignore",
    timeout: 180_000,
    env: {
      DATABASE_URL: testDatabaseUrl ?? "",
      APP_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      AUTH_JWT_SECRET: "e2e-jwt-secret-that-is-at-least-32-characters-long",
      BETTER_AUTH_SECRET: "e2e-better-auth-secret-at-least-32-characters",
      RESEND_API_KEY: "",
      AUTH_FAILURE_DELAY_MS: "0",
    },
  },
});
