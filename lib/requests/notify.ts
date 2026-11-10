// Request emails (Requests PRD §10, design D9): one outbox row per recipient,
// inside the caller's transaction, in the recipient's language. The actor is
// never emailed about their own action; only the requester and Super Admins
// see the decision note.
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatRequestNumber, shortReason } from "@/lib/accounting/requests";
import { enqueueEmail, type RequestEvent } from "@/lib/email/outbox";

type Tx = Prisma.TransactionClient;

export type Audience = "ADMINS" | "REQUESTER" | "OWNERS";

export type MailRequest = {
  id: string;
  year: number;
  number: number;
  propertyId: string;
  type: "ADVANCE" | "LOAN" | "GRANT";
  amountRequestedPaisa: bigint;
  amountApprovedPaisa: bigint | null;
  reason: string;
  owner: { displayName: string; userId: string | null };
};

type Recipient = { id: string; email: string; locale: "bn" | "en" };

/** Active Super Admins (global or this property). */
export async function activeAdmins(tx: Tx, propertyId: string): Promise<Recipient[]> {
  return tx.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN", OR: [{ propertyId: null }, { propertyId }] } } },
    select: { id: true, email: true, locale: true },
  });
}

async function recipients(tx: Tx, r: MailRequest, audience: Audience): Promise<Recipient[]> {
  if (audience === "ADMINS") return activeAdmins(tx, r.propertyId);
  if (audience === "REQUESTER") {
    if (!r.owner.userId) return [];
    const u = await tx.user.findFirst({ where: { id: r.owner.userId, status: "ACTIVE" }, select: { id: true, email: true, locale: true } });
    return u ? [u] : [];
  }
  const owners = await tx.owner.findMany({ where: { propertyId: r.propertyId, user: { status: "ACTIVE" } }, select: { user: { select: { id: true, email: true, locale: true } } } });
  return owners.flatMap((o) => (o.user ? [o.user] : []));
}

export async function notifyRequest(
  tx: Tx,
  r: MailRequest,
  event: RequestEvent,
  audience: Audience,
  opts: { actorId: string; actorName: string; note?: string | null; stamp?: string; reminderKind?: "PENDING_3_DAYS" | "APPROVED_PAST_DUE"; skipActor?: boolean },
): Promise<number> {
  const admins = new Set((await activeAdmins(tx, r.propertyId)).map((a) => a.id));
  let queued = 0;
  for (const to of await recipients(tx, r, audience)) {
    if (opts.skipActor !== false && to.id === opts.actorId) continue;
    const privileged = to.id === r.owner.userId || admins.has(to.id);
    const ok = await enqueueEmail(tx, {
      template: "REQUEST_UPDATE",
      toUserId: to.id,
      toEmail: to.email,
      locale: to.locale,
      payload: {
        event,
        requestId: r.id,
        number: formatRequestNumber(r.year, r.number),
        ownerName: r.owner.displayName,
        type: r.type,
        // Others see only what was approved/paid, never the asked amount (Rule 12).
        amountRequestedPaisa: privileged || r.amountApprovedPaisa === null ? Number(r.amountRequestedPaisa) : Number(r.amountApprovedPaisa),
        amountApprovedPaisa: r.amountApprovedPaisa === null ? null : Number(r.amountApprovedPaisa),
        shortReason: shortReason(r.reason),
        note: privileged ? (opts.note ?? null) : null,
        actorName: opts.actorName,
        reminderKind: opts.reminderKind ?? null,
      },
      dedupeKey: ["request", r.id, event, opts.reminderKind ?? opts.stamp ?? "", to.id].filter(Boolean).join(":"),
    });
    if (ok) queued++;
  }
  return queued;
}
