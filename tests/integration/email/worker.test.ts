import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/email/outbox";
import { MAX_ATTEMPTS, processBatch } from "@/lib/email/worker";
import type { Transport } from "@/lib/email/transport";
import { EmailSendError, type SendFailureCode } from "@/lib/email/errors";
import { createUser } from "../../helpers/factory";

afterEach(() => vi.useRealTimers());

function fakeTransport(fail = false) {
  const sent: { to: string; subject: string; text: string }[] = [];
  const t: Transport = {
    async send(m) {
      if (fail) throw new Error("provider down for rahim@example.com token=abc");
      sent.push({ to: m.to, subject: m.subject, text: m.text });
      return { id: `msg_${sent.length}` };
    },
  };
  return { t, sent };
}

function failingTransport(code: SendFailureCode, message: string) {
  let calls = 0;
  const t: Transport = {
    async send() {
      calls++;
      throw new EmailSendError(code, message, "validation_error", 403);
    },
  };
  return { t, calls: () => calls };
}

async function queueInvite(userId: string, email: string, key = "k1") {
  await enqueueEmail(prisma, {
    template: "INVITE",
    toUserId: userId,
    toEmail: email,
    locale: "bn",
    payload: { token: "RAW_TOKEN_VALUE_1234567890", firstName: "করিম", invitedBy: "Admin", expiresAt: new Date().toISOString() },
    dedupeKey: key,
  });
}

describe("email worker", () => {
  it("sends a queued email in the recipient's language, marks it SENT and scrubs the token", async () => {
    const user = await createUser({ status: "INVITED", password: null, locale: "bn" });
    await queueInvite(user.id, user.email);
    const { t, sent } = fakeTransport();
    expect(await processBatch(t)).toMatchObject({ sent: 1, failed: 0 });
    expect(sent[0].subject).toMatch(/আমন্ত্রণ/);
    expect(sent[0].text).toContain("/bn/invite/RAW_TOKEN_VALUE_1234567890");
    const row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row).toMatchObject({ status: "SENT", providerMessageId: "msg_1" });
    expect(row.sentAt).not.toBeNull();
    expect(JSON.stringify(row.payload)).not.toContain("RAW_TOKEN_VALUE");
  });

  it("retries with backoff and gives up after 5 attempts with a masked error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser({ status: "INVITED", password: null });
    await queueInvite(user.id, user.email);
    const { t } = fakeTransport(true);
    await processBatch(t);
    let row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.lastError).not.toContain("rahim@example.com");
    expect(row.lastError).not.toContain("token=abc");

    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(Date.now() + 24 * 3600_000);
      await processBatch(t);
    }
    row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    expect(row.lastError).toMatch(/^RETRIES_EXHAUSTED: /);
    expect(JSON.stringify(row.payload)).not.toContain("RAW_TOKEN_VALUE");
  });

  it("fails a permanently rejected email on the first attempt without retrying", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser({ status: "INVITED", password: null });
    await queueInvite(user.id, user.email);
    const { t, calls } = failingTransport("SENDER_NOT_VERIFIED", "The gmail.com domain is not verified for owner@gmail.com");
    expect(await processBatch(t)).toMatchObject({ sent: 0, failed: 1, retried: 0 });
    const row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(row.lastError).toMatch(/^SENDER_NOT_VERIFIED: /);
    expect(row.lastError).not.toContain("owner@gmail.com");
    expect(JSON.stringify(row.payload)).not.toContain("RAW_TOKEN_VALUE");

    vi.setSystemTime(Date.now() + 24 * 3600_000);
    await processBatch(t);
    expect(calls()).toBe(1);
  });

  it("retries a rate-limited email", async () => {
    const user = await createUser({ status: "INVITED", password: null });
    await queueInvite(user.id, user.email);
    const { t } = failingTransport("TRANSIENT", "Too many requests");
    expect(await processBatch(t)).toMatchObject({ retried: 1, failed: 0 });
    const row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("never emails an inactive user", async () => {
    const user = await createUser({ status: "INACTIVE" });
    await queueInvite(user.id, user.email);
    const { t, sent } = fakeTransport();
    await processBatch(t);
    expect(sent).toHaveLength(0);
    expect(await prisma.emailOutbox.findFirstOrThrow()).toMatchObject({ status: "FAILED", lastError: "RECIPIENT_INACTIVE" });
  });

  it("does not double-send when two workers run at once", async () => {
    const user = await createUser({ status: "INVITED", password: null });
    for (let i = 0; i < 6; i++) await queueInvite(user.id, user.email, `k${i}`);
    const { t, sent } = fakeTransport();
    await Promise.all([processBatch(t), processBatch(t), processBatch(t)]);
    expect(sent).toHaveLength(6);
    expect(await prisma.emailOutbox.count({ where: { status: "SENT" } })).toBe(6);
  });

  it("ignores a duplicate dedupe key and rolls back with its transaction", async () => {
    const user = await createUser();
    await queueInvite(user.id, user.email, "same");
    await queueInvite(user.id, user.email, "same");
    expect(await prisma.emailOutbox.count()).toBe(1);

    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueEmail(tx, { template: "RESET", toUserId: user.id, toEmail: user.email, locale: "en", payload: { token: "t", firstName: "x", expiresAt: "" }, dedupeKey: "rolled-back" });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await prisma.emailOutbox.count({ where: { dedupeKey: "rolled-back" } })).toBe(0);
  });
});
