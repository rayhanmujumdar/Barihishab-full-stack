import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { senderProblem } from "./sender";

describe("senderProblem", () => {
  it.each([
    "someone@gmail.com",
    "BariHisab <Someone@GMAIL.com>",
    "x@outlook.com",
    "\"Rayhan\" <r@yahoo.com>",
    "a@icloud.com",
  ])("flags a free-mail sender %s when a provider key is set", (from) => {
    expect(senderProblem(from, true)).toMatch(/EMAIL_FROM/);
    expect(senderProblem(from, true)).toMatch(/onboarding@resend\.dev/);
  });

  it.each(["BariHisab <no-reply@barihisab.com>", "BariHisab <onboarding@resend.dev>", "ops@mail.gmail.com.example.org"])("accepts %s", (from) => {
    expect(senderProblem(from, true)).toBeNull();
  });

  it("does not check the sender when no provider key is configured", () => {
    expect(senderProblem("someone@gmail.com", false)).toBeNull();
  });
});

describe("parseEnv sender rule", () => {
  const base = {
    DATABASE_URL: "postgres://x/y",
    AUTH_JWT_SECRET: "a".repeat(32),
    BETTER_AUTH_SECRET: "b".repeat(32),
    RESEND_API_KEY: "re_live",
    EMAIL_FROM: "BariHisab <rayhan@gmail.com>",
  };

  it("refuses a free-mail sender in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/EMAIL_FROM/);
  });

  it("allows it in development (startup only warns)", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development" }).EMAIL_FROM).toBe(base.EMAIL_FROM);
  });

  it("defaults EMAIL_WORKER to auto and accepts off", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development" }).EMAIL_WORKER).toBe("auto");
    expect(parseEnv({ ...base, NODE_ENV: "development", EMAIL_WORKER: "off" }).EMAIL_WORKER).toBe("off");
  });
});
