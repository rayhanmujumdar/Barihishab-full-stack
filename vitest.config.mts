import "dotenv/config";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The integration suite runs against a real Postgres database (never the dev DB).
// Same rule as tests/setup/test-db-url.ts (inlined: Vite's native config loader
// can't import extensionless TS files).
const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");

const alias = { "@": path.resolve(import.meta.dirname) };

const testEnv = {
  NODE_ENV: "test" as const,
  APP_URL: "http://localhost:3000",
  AUTH_JWT_SECRET: "test-jwt-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  AUTH_FAILURE_DELAY_MS: "0",
};

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["lib/generated/**", "lib/auth/data/**", "**/*.test.ts", "**/*.test.tsx"],
      // Design D12 gates: `pnpm test:coverage` fails below these.
      thresholds: {
        "lib/permissions.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "lib/auth/tokens.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "lib/auth/**/*.ts": { statements: 90, lines: 90 },
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts", "proxy.test.ts", "tests/unit/**/*.test.ts"],
          env: { ...testEnv, DATABASE_URL: testDatabaseUrl ?? "" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/integration-global.ts"],
          setupFiles: ["tests/setup/integration.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { ...testEnv, DATABASE_URL: testDatabaseUrl ?? "" },
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["components/**/*.test.tsx", "app/**/*.test.tsx", "tests/ui/**/*.test.tsx"],
          setupFiles: ["tests/setup/ui.ts"],
          env: { ...testEnv },
        },
      },
    ],
  },
});
