import { afterAll, beforeEach, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { DEFAULT_PASSWORD } from "../helpers/factory";

// Route handlers are called directly (no Next server), so there is no request
// scope for `connection()`; it only opts the route out of prerendering anyway.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// Auth PRD §8 Logging: capture everything the code under test logs and
// assert, per file, that no password, hash, JWT or raw token leaked.
const logged: string[] = [];
for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[method].bind(console);
  vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    original(...args);
  });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  const all = logged.join("\n");
  expect(all, "a password was logged").not.toContain(DEFAULT_PASSWORD);
  expect(all, "a password hash was logged").not.toMatch(/\$argon2id\$/);
  expect(all, "a JWT was logged").not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./);
  expect(all, "a cookie header was logged").not.toMatch(/bh_(at|rt|csrf)=[A-Za-z0-9_-]{20,}/);
  await prisma.$disconnect();
});
