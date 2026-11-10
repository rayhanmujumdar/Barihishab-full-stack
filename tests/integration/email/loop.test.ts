import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/email/outbox";
import { runWorkerLoop, startDevEmailWorker, stopDevEmailWorker } from "@/lib/email/loop";
import type { Transport } from "@/lib/email/transport";
import { createUser } from "../../helpers/factory";

afterEach(async () => {
  await stopDevEmailWorker();
});

function recorder() {
  const sent: string[] = [];
  const t: Transport = {
    async send(m) {
      sent.push(m.to);
      return { id: `m${sent.length}` };
    },
  };
  return { t, sent };
}

async function queue(userId: string, email: string) {
  await enqueueEmail(prisma, {
    template: "INVITE",
    toUserId: userId,
    toEmail: email,
    locale: "en",
    payload: { token: "T".repeat(40), firstName: "Karim", invitedBy: "Admin", expiresAt: new Date().toISOString() },
    dedupeKey: `loop-${email}`,
  });
}

describe("email worker loop", () => {
  it("runs one batch and returns when once is set", async () => {
    const user = await createUser({ status: "INVITED", password: null });
    await queue(user.id, user.email);
    const { t, sent } = recorder();
    await runWorkerLoop({ transport: t, once: true });
    expect(sent).toEqual([user.email]);
    expect(await prisma.emailOutbox.findFirstOrThrow()).toMatchObject({ status: "SENT" });
  });

  it("builds the transport per batch when given a factory, so config edits apply without a restart", async () => {
    const a = recorder();
    const b = recorder();
    let current = a.t;
    const controller = new AbortController();
    const loop = runWorkerLoop({ transport: () => current, signal: controller.signal, intervalMs: 20 });
    const userA = await createUser({ status: "INVITED", password: null });
    await queue(userA.id, userA.email);
    await expect.poll(() => a.sent.length, { timeout: 5000 }).toBe(1);
    current = b.t; // e.g. EMAIL_FROM edited in .env while the server runs
    const userB = await createUser({ status: "INVITED", password: null });
    await queue(userB.id, userB.email);
    await expect.poll(() => b.sent.length, { timeout: 5000 }).toBe(1);
    controller.abort();
    await loop;
    expect(a.sent).toEqual([userA.email]);
  });

  it("skips sending while another worker holds the gate", async () => {
    const user = await createUser({ status: "INVITED", password: null });
    await queue(user.id, user.email);
    const { t, sent } = recorder();
    await runWorkerLoop({ transport: t, once: true, gate: async () => false });
    expect(sent).toEqual([]);
    expect(await prisma.emailOutbox.findFirstOrThrow()).toMatchObject({ status: "QUEUED", attempts: 0 });
    await runWorkerLoop({ transport: t, once: true, gate: async () => true });
    expect(sent).toEqual([user.email]);
  });

  it("keeps polling until aborted", async () => {
    const { t, sent } = recorder();
    const controller = new AbortController();
    const loop = runWorkerLoop({ transport: t, signal: controller.signal, intervalMs: 20 });
    const user = await createUser({ status: "INVITED", password: null });
    await queue(user.id, user.email);
    await expect.poll(() => sent.length, { timeout: 5000 }).toBe(1);
    controller.abort();
    await loop;
  });

  it("starts the dev worker at most once per process", async () => {
    const { t, sent } = recorder();
    const first = startDevEmailWorker({ transport: t, intervalMs: 20 });
    const second = startDevEmailWorker({ transport: t, intervalMs: 20 });
    expect(second).toBe(first);
    const user = await createUser({ status: "INVITED", password: null });
    await queue(user.id, user.email);
    await expect.poll(() => sent.length, { timeout: 5000 }).toBe(1);
    await stopDevEmailWorker();
    expect(startDevEmailWorker({ transport: t, intervalMs: 20 })).not.toBe(first);
  });
});
