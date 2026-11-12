// Complaint emails (Notices & Complaints PRD §11; design D10). One outbox row
// per recipient in the caller's transaction, in their language; the actor is
// never emailed about their own action. Opt-out applies only to the events
// §11 marks as optional for that recipient.
import type { Prisma } from "@/lib/generated/prisma/client";
import { enqueueEmail, type ComplaintEvent } from "@/lib/email/outbox";
import { activeMembers, type Member } from "@/lib/users/members";
import { canSee, resolutionAudience, type ComplaintVisibility } from "./rules";

type Tx = Prisma.TransactionClient;

export type MailComplaint = { id: string; propertyId: string; title: string; visibility: ComplaintVisibility; aboutAdmin: boolean; createdById: string; complainantName: string };

type Target = { member: Member; optional: boolean };

function targets(members: readonly Member[], c: MailComplaint, event: ComplaintEvent): Target[] {
  const complainant = members.filter((m) => m.id === c.createdById);
  const admins = members.filter((m) => m.isAdmin);
  switch (event) {
    case "NEW":
      return members.filter((m) => m.id !== c.createdById).map((member) => ({ member, optional: true }));
    case "NEW_PRIVATE":
    case "WITHDRAWN":
    case "REOPENED":
      return admins.map((member) => ({ member, optional: false }));
    case "IN_REVIEW":
      return complainant.map((member) => ({ member, optional: true }));
    case "RESOLVED":
    case "REJECTED": {
      const others = resolutionAudience(c) === "ALL_MEMBERS" ? members.filter((m) => m.id !== c.createdById).map((member) => ({ member, optional: true })) : [];
      return [...complainant.map((member) => ({ member, optional: false })), ...others];
    }
  }
}

export async function notifyComplaint(
  tx: Tx,
  c: MailComplaint,
  event: ComplaintEvent,
  opts: { actorId: string; actorName: string; explanation?: string | null; stamp: string; skipAdmins?: boolean },
): Promise<number> {
  const members = await activeMembers(tx, c.propertyId);
  let queued = 0;
  for (const { member, optional } of targets(members, c, event)) {
    if (member.id === opts.actorId || (optional && !member.emailNotices) || (opts.skipAdmins && member.isAdmin)) continue;
    const ok = await enqueueEmail(tx, {
      template: "COMPLAINT_UPDATE",
      toUserId: member.id,
      toEmail: member.email,
      locale: member.locale,
      payload: {
        event,
        complaintId: c.id,
        title: c.title,
        complainantName: c.complainantName,
        actorName: opts.actorName,
        explanation: opts.explanation ?? null,
        link: canSee(c, { userId: member.id, viewAll: member.isAdmin }),
      },
      dedupeKey: `complaint:${c.id}:${event}:${opts.stamp}:${member.id}`,
    });
    if (ok) queued++;
  }
  return queued;
}
