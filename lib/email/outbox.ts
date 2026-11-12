// Transactional outbox (EML-01): API code only inserts rows, inside the same
// transaction as the change that triggers the email. scripts/email-worker.ts sends.
import type { EmailTemplate, Locale, Prisma } from "@/lib/generated/prisma/client";

export type InvitePayload = { token: string; firstName: string; invitedBy: string; expiresAt: string };
export type ResetPayload = { token: string; firstName: string; expiresAt: string };
export type PasswordChangedPayload = { firstName: string; changedAt: string };
export type RequestEvent = "SUBMITTED" | "RECORDED" | "EDITED" | "CANCELLED" | "APPROVED" | "SELF_APPROVED" | "REJECTED" | "WITHDRAWN" | "DISBURSED" | "REMINDER";
/** Requests PRD §10: never carries a fund account, reference number or method. */
export type RequestUpdatePayload = {
  event: RequestEvent;
  requestId: string;
  number: string;
  ownerName: string;
  type: "ADVANCE" | "LOAN" | "GRANT";
  amountRequestedPaisa: number;
  amountApprovedPaisa: number | null;
  /** ≤ 80 characters; the only reason other owners see. */
  shortReason: string;
  /** Decision note or reason — only for the requester and Super Admins. */
  note: string | null;
  actorName: string;
  reminderKind: "PENDING_3_DAYS" | "APPROVED_PAST_DUE" | null;
};

export type NoticeEvent = "PUBLISHED" | "EDITED" | "REMINDER";
/** Notices & Complaints PRD §11: the full notice text goes out ("[Urgent]" subject when urgent). */
export type NoticePayload = { event: NoticeEvent; noticeId: string; title: string; body: string; urgent: boolean; authorName: string };
export type ComplaintEvent = "NEW" | "NEW_PRIVATE" | "IN_REVIEW" | "RESOLVED" | "REJECTED" | "WITHDRAWN" | "REOPENED";
/** Title and link only — never the complaint text, contacts or bank details (§11, main PRD §11). */
export type ComplaintUpdatePayload = {
  event: ComplaintEvent;
  complaintId: string;
  title: string;
  complainantName: string;
  actorName: string;
  /** Resolution explanation (RESOLVED / REJECTED) or In review note. */
  explanation: string | null;
  /** False for members who can't open the complaint (private resolution about the Admin's own entry). */
  link: boolean;
};

export type OutboxPayload = {
  INVITE: InvitePayload;
  RESET: ResetPayload;
  PASSWORD_CHANGED: PasswordChangedPayload;
  REQUEST_UPDATE: RequestUpdatePayload;
  NOTICE: NoticePayload;
  COMPLAINT_UPDATE: ComplaintUpdatePayload;
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
