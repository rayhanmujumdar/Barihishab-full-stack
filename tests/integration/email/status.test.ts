import { describe, expect, it } from "vitest";
import type { EmailStatus, EmailTemplate } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { latestInviteStates, outboxStatus } from "@/lib/email/status";
import { createUser } from "../../helpers/factory";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
let n = 0;

async function row(o: { status: EmailStatus; createdAt?: Date; nextAttemptAt?: Date; lastError?: string | null; attempts?: number; template?: EmailTemplate; toUserId?: string | null; sentAt?: Date | null }) {
  return prisma.emailOutbox.create({
    data: {
      template: o.template ?? "INVITE",
      toUserId: o.toUserId ?? null,
      toEmail: "secret.person@example.com",
      locale: "en",
      payload: {},
      dedupeKey: `s${++n}`,
      status: o.status,
      attempts: o.attempts ?? 0,
      lastError: o.lastError ?? null,
      sentAt: o.sentAt ?? null,
      createdAt: o.createdAt ?? ago(MIN),
      nextAttemptAt: o.nextAttemptAt ?? ago(MIN),
    },
  });
}

describe("outboxStatus", () => {
  it("reports an empty, healthy outbox", async () => {
    expect(await outboxStatus(NOW)).toEqual({ queued: 0, oldestQueuedAt: null, stalled: false, failedLast7Days: 0, lastFailure: null });
  });

  it("flags rows nobody claimed for 10+ minutes as stalled", async () => {
    await row({ status: "QUEUED", createdAt: ago(20 * MIN), nextAttemptAt: ago(15 * MIN) });
    await row({ status: "SENDING", createdAt: ago(2 * MIN), nextAttemptAt: new Date(NOW.getTime() + 8 * MIN) });
    const s = await outboxStatus(NOW);
    expect(s).toMatchObject({ queued: 2, stalled: true });
    expect(s.oldestQueuedAt).toEqual(ago(20 * MIN));
  });

  it("does not treat a row waiting on backoff as stalled", async () => {
    await row({ status: "QUEUED", attempts: 1, createdAt: ago(5 * MIN), nextAttemptAt: new Date(NOW.getTime() + 2 * MIN) });
    expect(await outboxStatus(NOW)).toMatchObject({ queued: 1, stalled: false });
  });

  it("summarises recent failures by code without addresses or provider text", async () => {
    await row({ status: "FAILED", attempts: 1, createdAt: ago(1 * DAY), lastError: "SENDER_NOT_VERIFIED: The gmail.com domain is not verified" });
    await row({ status: "FAILED", createdAt: ago(2 * DAY), lastError: "RECIPIENT_INACTIVE" });
    await row({ status: "FAILED", attempts: 5, createdAt: ago(8 * DAY), lastError: "RETRIES_EXHAUSTED: down" });
    await row({ status: "SENT", createdAt: ago(1 * DAY), sentAt: ago(1 * DAY) });
    const s = await outboxStatus(NOW);
    expect(s.failedLast7Days).toBe(1);
    expect(s.lastFailure).toEqual({ at: ago(1 * DAY), template: "INVITE", failureCode: "SENDER_NOT_VERIFIED" });
    const body = JSON.stringify(s);
    expect(body).not.toContain("secret.person");
    expect(body).not.toContain("gmail.com");
  });
});

describe("latestInviteStates", () => {
  it("returns each user's newest invite as a code-only state", async () => {
    const a = await createUser({ status: "INVITED", password: null });
    const b = await createUser({ status: "INVITED", password: null });
    const c = await createUser({ status: "INVITED", password: null });
    await row({ toUserId: a.id, status: "SENT", createdAt: ago(3 * DAY), sentAt: ago(3 * DAY) });
    await row({ toUserId: a.id, status: "FAILED", attempts: 1, createdAt: ago(1 * DAY), lastError: "SENDER_NOT_VERIFIED: x" });
    await row({ toUserId: a.id, template: "RESET", status: "SENT", createdAt: ago(1 * MIN) });
    await row({ toUserId: b.id, status: "SENDING", createdAt: ago(2 * MIN) });

    const states = await latestInviteStates([a.id, b.id, c.id]);
    expect(states.get(a.id)).toEqual({ status: "FAILED", queuedAt: ago(1 * DAY).toISOString(), sentAt: null, failureCode: "SENDER_NOT_VERIFIED" });
    expect(states.get(b.id)).toMatchObject({ status: "QUEUED", failureCode: null });
    expect(states.has(c.id)).toBe(false);
  });

  it("does not query for an empty id list", async () => {
    expect((await latestInviteStates([])).size).toBe(0);
  });
});
