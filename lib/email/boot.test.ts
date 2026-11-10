import { afterEach, describe, expect, it, vi } from "vitest";
import { bootEmail, shouldRunDevWorker, warnSenderProblem } from "./boot";

const dev = { NODE_ENV: "development", EMAIL_WORKER: "auto", RESEND_API_KEY: "re_key", EMAIL_FROM: "BariHisab <onboarding@resend.dev>" } as const;

afterEach(() => vi.restoreAllMocks());

describe("shouldRunDevWorker", () => {
  it("auto: runs under next dev only when a provider key is set", () => {
    expect(shouldRunDevWorker(dev)).toBe(true);
    // A key-less workspace on a shared dev DB must not "deliver" real rows to its console.
    expect(shouldRunDevWorker({ ...dev, RESEND_API_KEY: undefined })).toBe(false);
    expect(shouldRunDevWorker({ ...dev, RESEND_API_KEY: "" })).toBe(false);
  });
  it("on: runs even with the console transport", () => {
    expect(shouldRunDevWorker({ ...dev, EMAIL_WORKER: "on", RESEND_API_KEY: undefined })).toBe(true);
  });
  it("off: never runs", () => {
    expect(shouldRunDevWorker({ ...dev, EMAIL_WORKER: "off" })).toBe(false);
  });
  it.each(["production", "test"] as const)("never runs when NODE_ENV=%s (next start, build, vitest)", (NODE_ENV) => {
    expect(shouldRunDevWorker({ ...dev, NODE_ENV, EMAIL_WORKER: "on" })).toBe(false);
  });
});

describe("warnSenderProblem", () => {
  it("warns once, naming the sandbox sender, for a free-mail sender", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(warnSenderProblem({ EMAIL_FROM: "x@gmail.com", RESEND_API_KEY: "re_key" })).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("onboarding@resend.dev");
  });
  it("stays quiet for a sendable sender", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(warnSenderProblem(dev)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("bootEmail", () => {
  it("starts the dev worker with a per-batch transport and the single-worker gate", () => {
    const start = vi.fn();
    const gate = vi.fn(async () => true);
    bootEmail(dev, { start, gate: () => gate });
    expect(start).toHaveBeenCalledTimes(1);
    const opts = start.mock.calls[0][0];
    expect(typeof opts.transport).toBe("function");
    expect(opts.gate).toBe(gate);
  });
  it("does not start without a key in auto mode (and skips the sender check without a key)", () => {
    const start = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    bootEmail({ ...dev, RESEND_API_KEY: undefined, EMAIL_FROM: "x@gmail.com" }, { start, gate: () => async () => true });
    expect(start).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled(); // no key → sender not checked
    bootEmail({ ...dev, RESEND_API_KEY: "" }, { start, gate: () => async () => true });
    expect(start).not.toHaveBeenCalled();
  });
});
