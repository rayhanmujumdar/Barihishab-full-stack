// Outbox worker (design D8): claim → render → send → mark. Claiming uses
// FOR UPDATE SKIP LOCKED plus a lease (next_attempt_at) so concurrent
// workers never send the same row and crashed claims get retried.
import type { EmailOutbox, Prisma } from "@/lib/generated/prisma/client";
import { addMs, MINUTE, now } from "@/lib/clock";
import { mask } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { EmailSendError, MAX_ATTEMPTS } from "./errors";
import type { OutboxPayload } from "./outbox";
import { renderEmail } from "./render";
import type { Transport } from "./transport";

export { MAX_ATTEMPTS };
const LEASE_MS = 10 * MINUTE;

/** Raw tokens may only live in the outbox until the row is terminal. */
function scrubbed(payload: Prisma.JsonValue): Prisma.InputJsonValue {
  const { token: _token, ...rest } = (payload ?? {}) as Record<string, unknown>;
  return rest as Prisma.InputJsonValue;
}

async function claim(limit: number): Promise<EmailOutbox[]> {
  const t = now();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE email_outbox SET status = 'SENDING', next_attempt_at = ${addMs(t, LEASE_MS)}
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE status IN ('QUEUED', 'SENDING') AND next_attempt_at <= ${t}
      ORDER BY next_attempt_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id`;
  if (rows.length === 0) return [];
  return prisma.emailOutbox.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

export async function processBatch(
  transport: Transport,
  opts: { limit?: number; appUrl?: string } = {},
): Promise<{ sent: number; failed: number; retried: number }> {
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const stats = { sent: 0, failed: 0, retried: 0 };

  for (const row of await claim(opts.limit ?? 20)) {
    const recipient = row.toUserId ? await prisma.user.findUnique({ where: { id: row.toUserId }, select: { status: true } }) : null;
    if (row.toUserId && (!recipient || recipient.status === "INACTIVE")) {
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "RECIPIENT_INACTIVE", payload: scrubbed(row.payload) } });
      stats.failed++;
      continue;
    }
    try {
      const message = renderEmail(row.template, row.locale, row.payload as unknown as OutboxPayload[typeof row.template], appUrl);
      const { id } = await transport.send({ to: row.toEmail, ...message });
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: now(), providerMessageId: id, attempts: row.attempts + 1, lastError: null, payload: scrubbed(row.payload) },
      });
      stats.sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const detail = mask(err instanceof Error ? err.message : String(err));
      // Permanent rejections (unverified sender, bad address) can never succeed: fail now.
      const permanent = err instanceof EmailSendError && err.permanent;
      if (permanent || attempts >= MAX_ATTEMPTS) {
        const code = permanent ? err.code : "RETRIES_EXHAUSTED";
        const lastError = `${code}: ${detail}`.slice(0, 500);
        await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "FAILED", attempts, lastError, payload: scrubbed(row.payload) } });
        stats.failed++;
      } else {
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: "QUEUED", attempts, lastError: detail.slice(0, 500), nextAttemptAt: addMs(now(), 2 ** attempts * MINUTE) },
        });
        stats.retried++;
      }
    }
  }
  return stats;
}
