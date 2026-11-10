import { describe, expect, it } from "vitest";
import { EmailSendError } from "./errors";
import { runEmailTest } from "./test-send";
import type { Transport } from "./transport";

const KEY = "re_SECRETkey1234567890abcdef";

function harness(send: Transport["send"], key: string | null = KEY) {
  const apiKey = key ?? undefined;
  const lines: string[] = [];
  const made: { apiKey: string | undefined; from: string }[] = [];
  const deps = {
    apiKey,
    defaultFrom: "BariHisab <x@gmail.com>",
    makeTransport: (k: string | undefined, from: string): Transport => {
      made.push({ apiKey: k, from });
      return { send };
    },
    out: (l: string) => lines.push(l),
  };
  return { deps, lines, made, text: () => lines.join("\n") };
}

const ok: Transport["send"] = async () => ({ id: "prov_123" });

describe("runEmailTest", () => {
  it("prints usage and exits 2 without a recipient", async () => {
    const h = harness(ok);
    expect(await runEmailTest([], h.deps)).toBe(2);
    expect(h.text()).toMatch(/Usage: pnpm email:test <to>/);
    expect(h.made).toHaveLength(0);
  });

  it("rejects a malformed recipient", async () => {
    const h = harness(ok);
    expect(await runEmailTest(["not-an-email"], h.deps)).toBe(2);
  });

  it("sends with --from and prints the provider id", async () => {
    let to = "";
    const h = harness(async (m) => {
      to = m.to;
      expect(m.text).toMatch(/BariHisab email service test/);
      return { id: "prov_123" };
    });
    expect(await runEmailTest(["owner@example.com", "--from", "BariHisab <onboarding@resend.dev>"], h.deps)).toBe(0);
    expect(h.made[0].from).toBe("BariHisab <onboarding@resend.dev>");
    expect(to).toBe("owner@example.com");
    expect(h.text()).toContain("prov_123");
  });

  it("explains an unverified sender, masks the key and exits 1", async () => {
    const h = harness(async () => {
      throw new EmailSendError("SENDER_NOT_VERIFIED", `The gmail.com domain is not verified (key ${KEY})`, "validation_error", 403);
    });
    expect(await runEmailTest(["owner@example.com"], h.deps)).toBe(1);
    expect(h.text()).toContain("SENDER_NOT_VERIFIED");
    expect(h.text()).toContain("validation_error");
    expect(h.text()).toMatch(/onboarding@resend\.dev/);
    expect(h.text()).not.toContain(KEY);
  });

  it("says no real email was sent when no API key is configured", async () => {
    const h = harness(ok, null);
    expect(await runEmailTest(["owner@example.com"], h.deps)).toBe(0);
    expect(h.text()).toMatch(/no real email was sent/i);
  });
});
