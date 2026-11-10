// Money request writes (Requests PRD F2–F8, F10, F11; design D2, D4, D9).
// Every write: lock the request row → check the transition → change → audit →
// outbox, in one transaction. Disburse also creates the linked advance, loan
// or grant expense in that same transaction (all or nothing, Rule 7).
import type { Attachment, Prisma } from "@/lib/generated/prisma/client";
import { approveCheck, canTransition, formatRequestNumber, type RequestAction, type RequestType } from "@/lib/accounting/requests";
import type { SaveIdempotent } from "@/lib/api/idempotency";
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, fieldFail, isFail, type Actor, type Fail, type Result } from "@/lib/api/result";
import { linkAttachments, prepareAttachments } from "@/lib/attachments/attachment-service";
import { audit, type AuditAction } from "@/lib/audit";
import { now, todayIsoInDhaka } from "@/lib/clock";
import { activeLoans, createLoanInTx } from "@/lib/loans/loan-service";
import { cashWarnings, createAdvanceInTx, latestOpenPeriod, lockOwner, type PayMethod } from "@/lib/owners/ledger-service";
import { prisma } from "@/lib/prisma";
import { createGrantExpenseInTx } from "@/lib/transactions/transaction-service";
import { displayName } from "@/lib/users/dto";
import { ownerStanding, pendingNumbers } from "./context-service";
import type { RequestDto, RequestWarning } from "./dto";
import { notifyRequest, type Audience } from "./notify";
import { REQUEST_INCLUDE, toDtos, type RequestRow } from "./request-read";
import type { RequestEvent } from "@/lib/email/outbox";

type Tx = Prisma.TransactionClient;

/** The acting user with the request permissions they hold. */
export type RequestActor = Actor & { viewAll: boolean; decide: boolean; record: boolean };

export const MAX_REQUEST_FILES = 3;
const NO_OPEN_MONTH = "Open a month first — payouts are recorded in an open month.";
const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;

const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type RequestFields = {
  type: RequestType;
  amountPaisa: number;
  reason: string;
  neededBy: string;
  repaymentPlan?: string | null;
};
export type SubmitInput = RequestFields & { ownerId?: string; attachmentIds?: string[]; privateAttachmentIds?: string[] };
export type EditInput = Partial<RequestFields> & { attachmentIds?: string[]; privateAttachmentIds?: string[]; removeAttachmentIds?: string[] };
export type DisburseInput = { date: string; fundAccountId: string; method: PayMethod; referenceNo?: string | null; installmentPaisa?: number | null };

export type WriteResult = { request: RequestDto; warnings: RequestWarning[] };

// ─── Shared helpers ───

async function actorName(db: Tx, id: string): Promise<string> {
  const u = await db.user.findUnique({ where: { id }, select: NAME.select });
  return u ? displayName(u) : "";
}

/** Row lock on a request of this property (design D4). */
async function lockRequest(tx: Tx, propertyId: string, id: string): Promise<RequestRow> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM money_requests WHERE id = ${id}::uuid AND property_id = ${propertyId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new Abort(failWith("NOT_FOUND"));
  return tx.moneyRequest.findUniqueOrThrow({ where: { id }, include: REQUEST_INCLUDE });
}

const isRequester = (r: RequestRow, actor: RequestActor) => r.owner.userId === actor.id || r.createdById === actor.id;

function mustTransition(r: RequestRow, action: RequestAction) {
  if (!canTransition(r.status, action)) throw new Abort(failWith("INVALID_REQUEST_STATUS"));
}

/** Requester-only actions: others get 404 (they can't see it) or 403 (Super Admin). */
function mustBeRequester(r: RequestRow, actor: RequestActor) {
  if (!isRequester(r, actor)) throw new Abort(failWith(actor.viewAll ? "FORBIDDEN" : "NOT_FOUND"));
}

function fieldChecks(f: Partial<RequestFields>): Fail | null {
  if (f.neededBy !== undefined && f.neededBy < todayIsoInDhaka()) return fieldFail("neededBy", "Pick today or a later date.");
  return null;
}

/** Validates new uploads (≤ 3 in total, owners only their own) before the transaction. */
async function checkUploads(propertyId: string, ids: string[], existing: number, actor: RequestActor): Promise<Attachment[] | Fail> {
  const unique = [...new Set(ids)];
  if (existing + unique.length > MAX_REQUEST_FILES) return fieldFail("attachmentIds", `At most ${MAX_REQUEST_FILES} files.`);
  const rows = await prepareAttachments(propertyId, unique, 0);
  if (isFail(rows)) return rows;
  if (!actor.viewAll && rows.some((r) => r.uploadedById !== actor.id)) return fieldFail("attachmentIds", "Upload the file again.");
  return rows;
}

async function linkRequestFiles(tx: Tx, propertyId: string, requestId: string, rows: Attachment[], privateIds: string[] | undefined, actor: Actor) {
  if (!rows.length) return;
  await linkAttachments(tx, propertyId, requestId, rows, actor, "money_request");
  const priv = (privateIds ?? []).filter((id) => rows.some((r) => r.id === id));
  if (priv.length) await tx.attachment.updateMany({ where: { id: { in: priv } }, data: { isPrivate: true } });
}

async function dto(tx: Tx, id: string, actor: RequestActor): Promise<RequestDto> {
  const row = await tx.moneyRequest.findUniqueOrThrow({ where: { id }, include: REQUEST_INCLUDE });
  return (await toDtos(tx, [row], { userId: actor.id, viewAll: actor.viewAll }))[0];
}

async function writeAudit(tx: Tx, actor: Actor, action: AuditAction, id: string, before: unknown, after: unknown, reason?: string | null) {
  await audit(tx, { actorId: actor.id, action, entityType: "money_request", entityId: id, before, after, reason: reason ?? null, ip: actor.ip, userAgent: actor.userAgent });
}

const snapshot = (r: { type: string; amountRequestedPaisa: bigint; amountApprovedPaisa?: bigint | null; reason: string; neededBy: Date; repaymentPlan: string | null; status: string }) => ({
  type: r.type,
  amountPaisa: Number(r.amountRequestedPaisa),
  amountApprovedPaisa: r.amountApprovedPaisa == null ? null : Number(r.amountApprovedPaisa),
  reason: r.reason,
  neededBy: iso(r.neededBy),
  repaymentPlan: r.repaymentPlan,
  status: r.status,
});

async function mail(tx: Tx, r: RequestRow, event: RequestEvent, audience: Audience, actor: Actor, opts: { note?: string | null; stamp?: string; actorName?: string } = {}) {
  await notifyRequest(tx, r, event, audience, { actorId: actor.id, actorName: opts.actorName ?? (await actorName(tx, actor.id)), note: opts.note, stamp: opts.stamp });
}

/** Soft warnings on submit/edit (F2, G11, G12, Rule 10). */
async function submitWarnings(tx: Tx, propertyId: string, ownerId: string, type: RequestType, amountPaisa: number, exceptId: string): Promise<RequestWarning[]> {
  const out: RequestWarning[] = (await pendingNumbers(tx, propertyId, ownerId, exceptId)).map((number) => ({ code: "PENDING_EXISTS", number }));
  const s = await ownerStanding(tx, propertyId, ownerId);
  if (type === "ADVANCE") {
    if (s.advanceLimitPaisa !== null && s.advanceUsedPaisa + amountPaisa > s.advanceLimitPaisa) out.push({ code: "ADVANCE_OVER_LIMIT", limitPaisa: s.advanceLimitPaisa });
    if (s.balancePaisa > 0) out.push({ code: "OWNER_OWED", balancePaisa: s.balancePaisa });
  }
  const latest = s.loans.at(-1);
  if (type === "LOAN" && latest) out.push({ code: "OWNER_HAS_LOAN", loanNumber: latest.number, outstandingPaisa: latest.outstandingPaisa });
  return out;
}

/** Next number of the property in the year; never reused (G9, design D2). */
async function nextNumber(tx: Tx, propertyId: string, year: number): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`request_number:${propertyId}:${year}`}))`;
  const max = await tx.moneyRequest.aggregate({ where: { propertyId, year }, _max: { number: true } });
  return (max._max.number ?? 0) + 1;
}

// ─── F2 Submit / F11 Record on behalf ───

export async function submitRequest(propertyId: string, input: SubmitInput, actor: RequestActor): Promise<Result<WriteResult>> {
  const bad = fieldChecks(input);
  if (bad) return bad;
  const own = await prisma.owner.findFirst({ where: { propertyId, userId: actor.id }, select: { id: true } });
  let ownerId = own?.id ?? null;
  if (input.ownerId && input.ownerId !== own?.id) {
    if (!actor.record) return failWith("FORBIDDEN");
    const target = await prisma.owner.findFirst({ where: { id: input.ownerId, propertyId }, select: { id: true } });
    if (!target) return fieldFail("ownerId", "Pick an owner.");
    ownerId = target.id;
  }
  if (!ownerId) return failWith("NO_OWNER_PROFILE");
  const recorded = ownerId !== own?.id;
  const uploads = await checkUploads(propertyId, input.attachmentIds ?? [], 0, actor);
  if (isFail(uploads)) return uploads;
  const today = todayIsoInDhaka();
  const year = Number(today.slice(0, 4));

  return inTransaction(async (tx) => {
    const owner = await lockOwner(tx, propertyId, ownerId!);
    if (!owner) throw new Abort(failWith("NOT_FOUND"));
    const row = await tx.moneyRequest.create({
      data: {
        propertyId,
        year,
        number: await nextNumber(tx, propertyId, year),
        ownerId: ownerId!,
        type: input.type,
        amountRequestedPaisa: BigInt(input.amountPaisa),
        reason: input.reason,
        neededBy: dateOf(input.neededBy),
        repaymentPlan: input.type === "LOAN" ? input.repaymentPlan || null : null,
        isSelf: actor.decide && owner.user_id === actor.id,
        recordedOnBehalf: recorded,
        createdById: actor.id,
      },
      include: REQUEST_INCLUDE,
    });
    await linkRequestFiles(tx, propertyId, row.id, uploads, input.privateAttachmentIds, actor);
    await writeAudit(tx, actor, recorded ? "request.recorded" : "request.submitted", row.id, null, { number: formatRequestNumber(row.year, row.number), ...snapshot(row) });
    const name = await actorName(tx, actor.id);
    await mail(tx, row, "SUBMITTED", "ADMINS", actor, { actorName: name });
    if (recorded) await mail(tx, row, "RECORDED", "REQUESTER", actor, { actorName: name });
    return { request: await dto(tx, row.id, actor), warnings: await submitWarnings(tx, propertyId, ownerId!, input.type, input.amountPaisa, row.id) };
  });
}

// ─── F3 Edit (Pending) / Cancel (Pending or Approved) ───

export async function editRequest(propertyId: string, id: string, input: EditInput, actor: RequestActor): Promise<Result<WriteResult>> {
  const bad = fieldChecks(input);
  if (bad) return bad;
  const current = await prisma.moneyRequest.findFirst({ where: { id, propertyId }, select: { id: true } });
  if (!current) return failWith("NOT_FOUND");
  const existing = await prisma.attachment.count({ where: { entityType: "money_request", entityId: id, removedAt: null, id: { notIn: input.removeAttachmentIds ?? [] } } });
  const uploads = await checkUploads(propertyId, input.attachmentIds ?? [], existing, actor);
  if (isFail(uploads)) return uploads;

  return inTransaction(async (tx) => {
    const r = await lockRequest(tx, propertyId, id);
    mustBeRequester(r, actor);
    mustTransition(r, "edit");
    const type = input.type ?? (r.type as RequestType);
    const updated = await tx.moneyRequest.update({
      where: { id },
      data: {
        type,
        ...(input.amountPaisa !== undefined ? { amountRequestedPaisa: BigInt(input.amountPaisa) } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.neededBy !== undefined ? { neededBy: dateOf(input.neededBy) } : {}),
        repaymentPlan: type === "LOAN" ? (input.repaymentPlan !== undefined ? input.repaymentPlan || null : r.repaymentPlan) : null,
      },
      include: REQUEST_INCLUDE,
    });
    for (const attId of input.removeAttachmentIds ?? []) {
      const { count } = await tx.attachment.updateMany({ where: { id: attId, propertyId, entityType: "money_request", entityId: id, removedAt: null }, data: { removedAt: now(), removedById: actor.id } });
      if (count) await audit(tx, { actorId: actor.id, action: "attachment.removed", entityType: "money_request", entityId: id, after: { attachmentId: attId }, ip: actor.ip, userAgent: actor.userAgent });
    }
    await linkRequestFiles(tx, propertyId, id, uploads, input.privateAttachmentIds, actor);
    await writeAudit(tx, actor, "request.edited", id, snapshot(r), snapshot(updated));
    await mail(tx, updated, "EDITED", "ADMINS", actor, { stamp: String(updated.updatedAt.getTime()) });
    return { request: await dto(tx, id, actor), warnings: await submitWarnings(tx, propertyId, updated.ownerId, type, Number(updated.amountRequestedPaisa), id) };
  });
}

export async function cancelRequest(propertyId: string, id: string, actor: RequestActor): Promise<Result<{ request: RequestDto }>> {
  return inTransaction(async (tx) => {
    const r = await lockRequest(tx, propertyId, id);
    mustBeRequester(r, actor);
    mustTransition(r, "cancel");
    const updated = await tx.moneyRequest.update({ where: { id }, data: { status: "CANCELLED" }, include: REQUEST_INCLUDE });
    await writeAudit(tx, actor, "request.cancelled", id, { status: r.status }, { status: "CANCELLED" });
    await mail(tx, updated, "CANCELLED", "ADMINS", actor);
    return { request: await dto(tx, id, actor) };
  });
}

// ─── F5 Approve / F6 Reject / F8 Withdraw ───

export async function approveRequest(propertyId: string, id: string, input: { amountPaisa?: number; note?: string | null }, actor: RequestActor): Promise<Result<{ request: RequestDto }>> {
  return inTransaction(async (tx) => {
    const r = await lockRequest(tx, propertyId, id);
    mustTransition(r, "approve");
    const requested = Number(r.amountRequestedPaisa);
    const amount = input.amountPaisa ?? requested;
    const fields = approveCheck(requested, amount, input.note);
    if (fields) throw new Abort(failWith("VALIDATION_FAILED", fields));
    const note = input.note?.trim() || null;
    const updated = await tx.moneyRequest.update({
      where: { id },
      data: { status: "APPROVED", amountApprovedPaisa: BigInt(amount), decidedById: actor.id, decidedAt: now(), decisionNote: note, decisionUnseen: true },
      include: REQUEST_INCLUDE,
    });
    await writeAudit(tx, actor, "request.approved", id, { status: r.status }, { status: "APPROVED", amountApprovedPaisa: amount, selfApproved: r.isSelf }, note);
    // G15: a self-request is told to every owner; otherwise only the requester.
    if (r.isSelf) await mail(tx, updated, "SELF_APPROVED", "OWNERS", actor, { note });
    else await mail(tx, updated, "APPROVED", "REQUESTER", actor, { note });
    return { request: await dto(tx, id, actor) };
  });
}

async function decideWithReason(propertyId: string, id: string, reason: string, actor: RequestActor, kind: "reject" | "withdraw"): Promise<Result<{ request: RequestDto }>> {
  return inTransaction(async (tx) => {
    const r = await lockRequest(tx, propertyId, id);
    mustTransition(r, kind);
    const status = kind === "reject" ? "REJECTED" : "WITHDRAWN";
    const updated = await tx.moneyRequest.update({
      where: { id },
      data: { status, decidedById: actor.id, decidedAt: now(), decisionNote: reason, decisionUnseen: true },
      include: REQUEST_INCLUDE,
    });
    await writeAudit(tx, actor, kind === "reject" ? "request.rejected" : "request.withdrawn", id, { status: r.status }, { status }, reason);
    await mail(tx, updated, status, "REQUESTER", actor, { note: reason });
    return { request: await dto(tx, id, actor) };
  });
}

export const rejectRequest = (propertyId: string, id: string, reason: string, actor: RequestActor) => decideWithReason(propertyId, id, reason, actor, "reject");
export const withdrawRequest = (propertyId: string, id: string, reason: string, actor: RequestActor) => decideWithReason(propertyId, id, reason, actor, "withdraw");

// ─── F7 Disburse ───

export type DisburseResult = { request: RequestDto; entry: { kind: "ADVANCE" | "LOAN" | "EXPENSE"; id: string }; warnings: RequestWarning[] };

type Posted = { entry: DisburseResult["entry"]; warnings: RequestWarning[] };
const CASH_WARNINGS = new Set(["FUND_SHORT", "HOUSE_FUND_SHORT"]);

/** Creates the one entry a disbursal books (Rule 7): advance, loan or grant expense, linked to the request. */
async function postEntry(tx: Tx, propertyId: string, periodId: string, r: RequestRow, input: DisburseInput, actor: Actor): Promise<Posted> {
  const amount = Number(r.amountApprovedPaisa!);
  const cashWarn = async () => (await cashWarnings(tx, propertyId, input.fundAccountId, amount)) as RequestWarning[];
  if (r.type === "ADVANCE") {
    const cash = { ownerId: r.ownerId, amountPaisa: amount, date: input.date, fundAccountId: input.fundAccountId, method: input.method, referenceNo: input.referenceNo ?? null, reason: r.reason };
    const a = await createAdvanceInTx(tx, propertyId, periodId, cash, actor, { isSelf: r.isSelf, origin: "REQUEST", requestId: r.id, note: `Advance · ${r.reason}` });
    // The limit was weighed at approval; only cash warnings matter now.
    return { entry: { kind: "ADVANCE", id: a.row.id }, warnings: a.warnings.filter((w) => CASH_WARNINGS.has(w.code)) as RequestWarning[] };
  }
  if (r.type === "LOAN") {
    if (input.installmentPaisa && input.installmentPaisa > amount) throw new Abort(fieldFail("installmentPaisa", "The instalment can't be more than the loan."));
    const existing = await activeLoans(tx, propertyId, [r.ownerId]);
    const loan = await createLoanInTx(
      tx,
      {
        propertyId,
        ownerId: r.ownerId,
        principalPaisa: amount,
        disbursedOn: dateOf(input.date),
        fundAccountId: input.fundAccountId,
        method: input.method,
        referenceNo: input.referenceNo || null,
        reason: r.reason,
        payoutEntryId: null,
        installmentPaisa: input.installmentPaisa ?? null,
        origin: "REQUEST",
        isSelf: r.isSelf,
        flagged: existing.length > 0,
        requestId: r.id,
      },
      actor,
    );
    return { entry: { kind: "LOAN", id: loan.id }, warnings: await cashWarn() };
  }
  const description = `Owner special grant · ${r.owner.displayName} · ${formatRequestNumber(r.year, r.number)}`;
  const t = await createGrantExpenseInTx(
    tx,
    { propertyId, periodId, amountPaisa: amount, txnDate: input.date, fundAccountId: input.fundAccountId, description, beneficiaryOwnerId: r.ownerId, requestId: r.id },
    actor,
  );
  return { entry: { kind: "EXPENSE", id: t.id }, warnings: await cashWarn() };
}

export async function disburseRequest(propertyId: string, id: string, input: DisburseInput, actor: RequestActor, save?: SaveIdempotent): Promise<Result<DisburseResult>> {
  const fund = await prisma.fundAccount.findFirst({ where: { id: input.fundAccountId, propertyId, isActive: true }, select: { id: true } });
  if (!fund) return fieldFail("fundAccountId", "Pick an active fund account.");
  if (input.date > todayIsoInDhaka()) return fieldFail("date", "Date can't be in the future.");

  const result = await inTransaction(
    async (tx) => {
      const r = await lockRequest(tx, propertyId, id);
      mustTransition(r, "disburse");
      await lockOwner(tx, propertyId, r.ownerId);
      const period = await latestOpenPeriod(tx, propertyId);
      const { entry, warnings } = await postEntry(tx, propertyId, period.id, r, input, actor);
      const updated = await tx.moneyRequest.update({ where: { id }, data: { status: "DISBURSED", disbursedAt: now(), decisionUnseen: true }, include: REQUEST_INCLUDE });
      const after = { status: "DISBURSED", amountPaisa: Number(r.amountApprovedPaisa!), date: input.date, method: input.method, referenceNo: input.referenceNo || null, entry };
      await writeAudit(tx, actor, "request.disbursed", id, { status: r.status }, after);
      // §10: every owner learns who got what; the approver is named, never the account or reference.
      const approver = r.decidedBy ? displayName(r.decidedBy) : await actorName(tx, actor.id);
      await notifyRequest(tx, updated, "DISBURSED", "OWNERS", { actorId: actor.id, actorName: approver });
      const data: DisburseResult = { request: await dto(tx, id, actor), entry, warnings };
      await save?.(tx, data);
      return data;
    },
    { timeout: 20_000 },
  );
  if (!result.ok && result.code === "NO_OPEN_PERIOD") return { ...result, message: NO_OPEN_MONTH };
  return result;
}
