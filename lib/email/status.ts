// Read model for operators (fix-email-delivery D4): outbox health and each
// invited user's latest invite state. Only stable codes leave this module —
// never recipient addresses, payloads, tokens or provider text.
import type { EmailStatus, EmailTemplate, Prisma } from "@/lib/generated/prisma/client";
import { DAY, MINUTE, now as clockNow } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { failureCode, type FailureCode } from "./errors";

const STALL_AFTER_MS = 10 * MINUTE;
const FAILED_WINDOW_MS = 7 * DAY;
const PENDING: EmailStatus[] = ["QUEUED", "SENDING"];

export type OutboxStatus = {
  queued: number;
  oldestQueuedAt: Date | null;
  stalled: boolean;
  failedLast7Days: number;
  lastFailure: { at: Date; template: EmailTemplate; failureCode: FailureCode | null } | null;
};

export async function outboxStatus(at: Date = clockNow()): Promise<OutboxStatus> {
  // Rows reach a terminal state within ~30 min of creation, so created_at
  // stands in for "failed at" (the table has no updated_at).
  const recentFailed: Prisma.EmailOutboxWhereInput = {
    status: "FAILED",
    createdAt: { gte: new Date(at.getTime() - FAILED_WINDOW_MS) },
    OR: [{ lastError: null }, { NOT: { lastError: { startsWith: "RECIPIENT_INACTIVE" } } }],
  };
  const [pending, stalledRow, failedCount, lastFailed] = await prisma.$transaction([
    prisma.emailOutbox.aggregate({ where: { status: { in: PENDING } }, _count: { _all: true }, _min: { createdAt: true } }),
    // next_attempt_at, not created_at: a row on backoff is waiting, not stalled.
    prisma.emailOutbox.findFirst({ where: { status: { in: PENDING }, nextAttemptAt: { lt: new Date(at.getTime() - STALL_AFTER_MS) } }, select: { id: true } }),
    prisma.emailOutbox.count({ where: recentFailed }),
    prisma.emailOutbox.findFirst({ where: recentFailed, orderBy: { createdAt: "desc" }, select: { createdAt: true, template: true, lastError: true, attempts: true } }),
  ]);
  return {
    queued: pending._count._all,
    oldestQueuedAt: pending._min.createdAt,
    stalled: stalledRow !== null,
    failedLast7Days: failedCount,
    lastFailure: lastFailed ? { at: lastFailed.createdAt, template: lastFailed.template, failureCode: failureCode(lastFailed.lastError, lastFailed.attempts) } : null,
  };
}

/** JSON shape of outboxStatus() for the API and the server-rendered Users page. */
export type OutboxStatusJson = Omit<OutboxStatus, "oldestQueuedAt" | "lastFailure"> & {
  oldestQueuedAt: string | null;
  lastFailure: { at: string; template: EmailTemplate; failureCode: FailureCode | null } | null;
};

export async function outboxStatusJson(at?: Date): Promise<OutboxStatusJson> {
  const s = await outboxStatus(at);
  return {
    ...s,
    oldestQueuedAt: s.oldestQueuedAt?.toISOString() ?? null,
    lastFailure: s.lastFailure ? { ...s.lastFailure, at: s.lastFailure.at.toISOString() } : null,
  };
}

export type InviteEmailState = {
  status: "QUEUED" | "SENT" | "FAILED";
  queuedAt: string;
  sentAt: string | null;
  failureCode: FailureCode | null;
};

/** The newest INVITE row per user, in one query. Users without one are absent. */
export async function latestInviteStates(userIds: string[]): Promise<Map<string, InviteEmailState>> {
  const out = new Map<string, InviteEmailState>();
  if (userIds.length === 0) return out;
  const rows = await prisma.$queryRaw<{ to_user_id: string; status: EmailStatus; created_at: Date; sent_at: Date | null; last_error: string | null; attempts: number }[]>`
    SELECT DISTINCT ON (to_user_id) to_user_id, status, created_at, sent_at, last_error, attempts
    FROM email_outbox
    WHERE template = 'INVITE' AND to_user_id = ANY(${userIds}::uuid[])
    ORDER BY to_user_id, created_at DESC, id DESC`;
  for (const r of rows) {
    out.set(r.to_user_id, {
      status: r.status === "SENDING" ? "QUEUED" : (r.status as InviteEmailState["status"]),
      queuedAt: r.created_at.toISOString(),
      sentAt: r.sent_at?.toISOString() ?? null,
      failureCode: r.status === "FAILED" ? failureCode(r.last_error, r.attempts) : null,
    });
  }
  return out;
}
