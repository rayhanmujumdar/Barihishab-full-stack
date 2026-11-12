// Notice emails (Notices & Complaints PRD §11, Rule 3; design D10): one outbox
// row per recipient inside the caller's transaction, in their language. Urgent
// notices and reminders ignore the opt-out; normal publish/edit honour it.
import type { Prisma } from "@/lib/generated/prisma/client";
import { enqueueEmail, type NoticeEvent } from "@/lib/email/outbox";
import type { Member } from "@/lib/users/members";

type Tx = Prisma.TransactionClient;

export type MailNotice = { id: string; title: string; body: string; priority: "NORMAL" | "URGENT" };

/** Members a notice email may reach: everyone for urgent ones, opted-in members otherwise. */
export function noticeAudience(members: readonly Member[], urgent: boolean): Member[] {
  return urgent ? [...members] : members.filter((m) => m.emailNotices);
}

export async function queueNoticeEmails(tx: Tx, n: MailNotice, event: NoticeEvent, to: readonly Member[], opts: { authorName: string; stamp: string }): Promise<number> {
  let queued = 0;
  for (const m of to) {
    const ok = await enqueueEmail(tx, {
      template: "NOTICE",
      toUserId: m.id,
      toEmail: m.email,
      locale: m.locale,
      payload: { event, noticeId: n.id, title: n.title, body: n.body, urgent: n.priority === "URGENT", authorName: opts.authorName },
      dedupeKey: `notice:${n.id}:${event}:${opts.stamp}:${m.id}`,
    });
    if (ok) queued++;
  }
  return queued;
}
