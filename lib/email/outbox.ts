// Transactional outbox (EML-01): API code only inserts rows, inside the same
// transaction as the change that triggers the email. scripts/email-worker.ts sends.
import type { EmailTemplate, Locale, Prisma } from "@/lib/generated/prisma/client";

export type InvitePayload = { token: string; firstName: string; invitedBy: string; expiresAt: string };
export type ResetPayload = { token: string; firstName: string; expiresAt: string };
export type PasswordChangedPayload = { firstName: string; changedAt: string };

export type OutboxPayload = {
  INVITE: InvitePayload;
  RESET: ResetPayload;
  PASSWORD_CHANGED: PasswordChangedPayload;
};

type Db = Pick<Prisma.TransactionClient, "emailOutbox">;

/** Inserts an outbox row; a repeated dedupeKey is silently ignored. Returns true if queued. */
export async function enqueueEmail<T extends EmailTemplate>(
  db: Db,
  e: {
    template: T;
    toUserId: string | null;
    toEmail: string;
    locale: Locale;
    payload: OutboxPayload[T];
    dedupeKey: string;
  },
): Promise<boolean> {
  const res = await db.emailOutbox.createMany({
    data: [
      {
        template: e.template,
        toUserId: e.toUserId,
        toEmail: e.toEmail,
        locale: e.locale,
        payload: e.payload as unknown as Prisma.InputJsonValue,
        dedupeKey: e.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
  return res.count === 1;
}
