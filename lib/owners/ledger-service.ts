// Owner ledger writes and statement (Owners PRD F3, F10–F14; PRD §5.4).
// Every money move: lock the owner row (serialises balance checks) → lock the
// latest open period → compute with the pure module → insert → audit →
// idempotency row, all in one transaction.
import type { Attachment, Prisma } from "@/lib/generated/prisma/client";
import { advanceLimit, splitPayout, statement, type LedgerType } from "@/lib/accounting/owners";
import type { SaveIdempotent } from "@/lib/api/idempotency";
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Fail, type Result } from "@/lib/api/result";
import { attachmentsFor, linkAttachments, prepareAttachments, type AttachmentDto } from "@/lib/attachments/attachment-service";
import { audit, type AuditAction } from "@/lib/audit";
import { now, todayIsoInDhaka } from "@/lib/clock";
import { balanceOf, houseFundBalance } from "@/lib/master-data/fund-service";
import { monthDate, monthKey } from "@/lib/periods/month";
import { ensureCurrentPeriod, lockPeriod } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { isAfterTomorrow } from "@/lib/transactions/rules";
import { displayName } from "@/lib/users/dto";
import { createLoanInTx, type LoanDto } from "./loan-service";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type PayMethod = "CASH" | "BANK" | "BKASH" | "NAGAD";

export type LedgerEntryDto = {
  id: string;
  ownerId: string;
  type: LedgerType;
  amountPaisa: number;
  date: string;
  month: string;
  fundAccountId: string | null;
  fundAccountName: string | null;
  method: PayMethod | null;
  referenceNo: string | null;
  note: string | null;
  referenceMonth: string | null;
  reversesId: string | null;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  isSelf: boolean;
  flagged: boolean;
  recordedBy: string;
  recordedAt: string;
  attachments: Pick<AttachmentDto, "id" | "fileName" | "mime">[];
};

export type LedgerWarning =
  | { code: "FUND_SHORT"; fundAccountId: string; balancePaisa: number }
  | { code: "HOUSE_FUND_SHORT"; balancePaisa: number }
  | { code: "ADVANCE_OVER_LIMIT"; limitPaisa: number };

const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;
const ENTRY_INCLUDE = {
  period: { select: { month: true } },
  referencePeriod: { select: { month: true } },
  fundAccount: { select: { name: true } },
  createdBy: NAME,
} as const;
type EntryRow = Prisma.OwnerLedgerEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

function toEntryDto(e: EntryRow, attachments: AttachmentDto[] = []): LedgerEntryDto {
  return {
    id: e.id,
    ownerId: e.ownerId,
    type: e.type,
    amountPaisa: Number(e.amountPaisa),
    date: iso(e.entryDate),
    month: monthKey(e.period.month),
    fundAccountId: e.fundAccountId,
    fundAccountName: e.fundAccount?.name ?? null,
    method: e.method,
    referenceNo: e.referenceNo,
    note: e.note,
    referenceMonth: e.referencePeriod ? monthKey(e.referencePeriod.month) : null,
    reversesId: e.reversesId,
    voided: e.voidedAt !== null,
    voidedAt: e.voidedAt?.toISOString() ?? null,
    voidReason: e.voidReason,
    isSelf: e.isSelf,
    flagged: e.flagged,
    recordedBy: displayName(e.createdBy),
    recordedAt: e.createdAt.toISOString(),
    attachments: attachments.map(({ id, fileName, mime }) => ({ id, fileName, mime })),
  };
}

async function entryDtos(db: Db, rows: EntryRow[]): Promise<LedgerEntryDto[]> {
  const files = await attachmentsFor(db, rows.map((r) => r.id));
  return rows.map((r) => toEntryDto(r, files.get(r.id)));
}

// ─── Guards ───

/** Row lock on the owner: concurrent money moves for one owner run one at a time. */
async function lockOwner(tx: Tx, propertyId: string, ownerId: string) {
  const rows = await tx.$queryRaw<{ id: string; user_id: string | null }[]>`
    SELECT id, user_id FROM owners WHERE id = ${ownerId}::uuid AND property_id = ${propertyId}::uuid FOR UPDATE`;
  return rows[0] ?? null;
}

/** Rule 14: money moves post in the latest OPEN month (share-locked against a close). */
async function latestOpenPeriod(tx: Tx, propertyId: string) {
  const p = await tx.period.findFirst({ where: { propertyId, status: "OPEN" }, orderBy: { month: "desc" }, select: { id: true } });
  const locked = p ? await lockPeriod(tx, p.id) : null;
  if (locked?.status !== "OPEN") throw new Abort(failWith("NO_OPEN_PERIOD"));
  return locked;
}

async function ownerBalance(db: Db, ownerId: string): Promise<number> {
  const r = await db.ownerLedgerEntry.aggregate({ where: { ownerId }, _sum: { amountPaisa: true } });
  return Number(r._sum.amountPaisa ?? 0);
}

type CashOut = { ownerId: string; amountPaisa: number; date: string; fundAccountId: string; method: PayMethod; referenceNo?: string | null; attachmentIds?: string[] };

/** Field checks shared by payouts and advances (outside the transaction). */
async function checkCashOut(propertyId: string, input: CashOut): Promise<Attachment[] | Fail> {
  const fund = await prisma.fundAccount.findFirst({ where: { id: input.fundAccountId, propertyId, isActive: true }, select: { id: true } });
  if (!fund) return fieldFail("fundAccountId", "Pick an active fund account.");
  if (isAfterTomorrow(input.date, todayIsoInDhaka())) return fieldFail("date", "Date can't be in the future.");
  const owner = await prisma.owner.findFirst({ where: { id: input.ownerId, propertyId }, select: { id: true } });
  if (!owner) return fieldFail("ownerId", "Pick an owner.");
  return prepareAttachments(propertyId, input.attachmentIds ?? [], 0);
}

const isFail = (v: unknown): v is Fail => !Array.isArray(v) && (v as Fail)?.ok === false;

async function cashWarnings(tx: Tx, propertyId: string, fundAccountId: string, amountPaisa: number): Promise<LedgerWarning[]> {
  const out: LedgerWarning[] = [];
  const fund = await balanceOf(tx, propertyId, fundAccountId);
  if (fund < 0) out.push({ code: "FUND_SHORT", fundAccountId, balancePaisa: fund });
  const house = await houseFundBalance(tx, propertyId);
  if (house < 0) out.push({ code: "HOUSE_FUND_SHORT", balancePaisa: house + amountPaisa });
  return out;
}

type NewEntry = {
  type: LedgerType;
  amountPaisa: number;
  date: string;
  fundAccountId?: string | null;
  method?: PayMethod | null;
  referenceNo?: string | null;
  note?: string | null;
  referencePeriodId?: string | null;
  reversesId?: string | null;
  isSelf?: boolean;
  flagged?: boolean;
};

async function insertEntry(tx: Tx, propertyId: string, ownerId: string, periodId: string, e: NewEntry, actor: Actor, action: AuditAction, reason?: string | null) {
  const row = await tx.ownerLedgerEntry.create({
    data: {
      propertyId,
      ownerId,
      periodId,
      type: e.type,
      amountPaisa: BigInt(e.amountPaisa),
      entryDate: dateOf(e.date),
      fundAccountId: e.fundAccountId ?? null,
      method: e.method ?? null,
      referenceNo: e.referenceNo || null,
      note: e.note || null,
      referencePeriodId: e.referencePeriodId ?? null,
      reversesId: e.reversesId ?? null,
      isSelf: e.isSelf ?? false,
      flagged: e.flagged ?? false,
      createdById: actor.id,
    },
    include: ENTRY_INCLUDE,
  });
  await audit(tx, { actorId: actor.id, action, entityType: "owner_ledger_entry", entityId: row.id, after: toEntryDto(row), reason: reason ?? null, ip: actor.ip, userAgent: actor.userAgent });
  return row;
}

async function withFiles(tx: Tx, rows: EntryRow[]) {
  return entryDtos(tx, rows);
}

// ─── F10 Opening balance ───

export async function setOpening(propertyId: string, ownerId: string, input: { amountPaisa: number; note?: string | null }, actor: Actor): Promise<Result<{ entry: LedgerEntryDto; balancePaisa: number }>> {
  await ensureCurrentPeriod(propertyId);
  return inTransaction(async (tx) => {
    if (!(await lockOwner(tx, propertyId, ownerId))) throw new Abort(failWith("NOT_FOUND"));
    if (await tx.period.findFirst({ where: { propertyId, status: "CLOSED" }, select: { id: true } })) throw new Abort(failWith("OPENING_LOCKED"));
    const current = await tx.ownerLedgerEntry.findFirst({ where: { ownerId, type: "OPENING" }, include: ENTRY_INCLUDE });
    let row: EntryRow;
    if (current) {
      row = await tx.ownerLedgerEntry.update({
        where: { id: current.id },
        data: { amountPaisa: BigInt(input.amountPaisa), note: input.note || null },
        include: ENTRY_INCLUDE,
      });
    } else {
      const earliest = await tx.period.findFirstOrThrow({ where: { propertyId }, orderBy: { month: "asc" } });
      row = await tx.ownerLedgerEntry.create({
        data: { propertyId, ownerId, periodId: earliest.id, type: "OPENING", amountPaisa: BigInt(input.amountPaisa), entryDate: earliest.month, note: input.note || null, createdById: actor.id },
        include: ENTRY_INCLUDE,
      });
    }
    const brief = (e: EntryRow) => ({ amountPaisa: Number(e.amountPaisa), note: e.note });
    await audit(tx, {
      actorId: actor.id,
      action: "ledger.opening_set",
      entityType: "owner_ledger_entry",
      entityId: row.id,
      before: current ? brief(current) : null,
      after: brief(row),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { entry: toEntryDto(row), balancePaisa: await ownerBalance(tx, ownerId) };
  });
}

// ─── F11 Pay an owner ───

export type PayoutInput = CashOut & { note?: string | null; splitExcessAs?: "ADVANCE" | "LOAN"; excessReason?: string | null };
export type PayoutResult = { entries: LedgerEntryDto[]; loan: LoanDto | null; balancePaisa: number; warnings: LedgerWarning[] };

const EXCESS_REASON = "Paid beyond balance";

export async function createPayout(propertyId: string, input: PayoutInput, actor: Actor, save?: SaveIdempotent): Promise<Result<PayoutResult>> {
  const uploads = await checkCashOut(propertyId, input);
  if (isFail(uploads)) return uploads;
  return inTransaction(async (tx) => {
    const owner = await lockOwner(tx, propertyId, input.ownerId);
    const period = await latestOpenPeriod(tx, propertyId);
    const balance = await ownerBalance(tx, input.ownerId);
    const { payoutPaisa, excessPaisa } = splitPayout(input.amountPaisa, balance);
    if (excessPaisa > 0 && !input.splitExcessAs) {
      throw new Abort(failWith("EXCEEDS_BALANCE", undefined, { balancePaisa: balance, payoutPaisa, excessPaisa }));
    }
    const cash = { date: input.date, fundAccountId: input.fundAccountId, method: input.method, referenceNo: input.referenceNo };
    const rows: EntryRow[] = [];
    if (payoutPaisa > 0) {
      rows.push(await insertEntry(tx, propertyId, input.ownerId, period.id, { ...cash, type: "PAYOUT", amountPaisa: -payoutPaisa, note: input.note }, actor, "ledger.payout_created"));
    }
    const excessReason = input.excessReason?.trim() || input.note?.trim() || EXCESS_REASON;
    let loan: LoanDto | null = null;
    if (excessPaisa > 0 && input.splitExcessAs === "ADVANCE") {
      const isSelf = owner!.user_id === actor.id;
      rows.push(await insertEntry(tx, propertyId, input.ownerId, period.id, { ...cash, type: "ADVANCE", amountPaisa: -excessPaisa, note: excessReason, isSelf }, actor, "ledger.advance_created", excessReason));
    } else if (excessPaisa > 0) {
      loan = await createLoanInTx(
        tx,
        { propertyId, ownerId: input.ownerId, principalPaisa: excessPaisa, disbursedOn: dateOf(input.date), fundAccountId: input.fundAccountId, method: input.method, referenceNo: input.referenceNo || null, reason: excessReason, payoutEntryId: rows[0]?.id ?? null },
        actor,
      );
    }
    // Receipts go on the first ledger entry (or the loan when that is all there is).
    if (rows[0]) await linkAttachments(tx, propertyId, rows[0].id, uploads, actor, "owner_ledger_entry");
    else if (loan) await linkAttachments(tx, propertyId, loan.id, uploads, actor, "loan");
    const data: PayoutResult = {
      entries: await withFiles(tx, rows),
      loan,
      balancePaisa: await ownerBalance(tx, input.ownerId),
      warnings: await cashWarnings(tx, propertyId, input.fundAccountId, input.amountPaisa),
    };
    await save?.(tx, data);
    return data;
  });
}

// ─── F12 Record an advance ───

export type AdvanceInput = CashOut & { reason: string };
export type AdvanceResult = { entry: LedgerEntryDto; balancePaisa: number; warnings: LedgerWarning[] };

/** Average per-month entitlement over the last 3 closed months (Rule 16). */
async function advanceLimitFor(tx: Tx, propertyId: string, ownerId: string): Promise<number | null> {
  const closed = await tx.period.findMany({ where: { propertyId, status: "CLOSED" }, orderBy: { month: "desc" }, take: 3, select: { id: true } });
  if (!closed.length) return null;
  const sums = await tx.ownerLedgerEntry.groupBy({
    by: ["periodId"],
    where: { ownerId, type: "ENTITLEMENT", periodId: { in: closed.map((p) => p.id) } },
    _sum: { amountPaisa: true },
  });
  const byPeriod = new Map(sums.map((s) => [s.periodId, Number(s._sum.amountPaisa ?? 0)]));
  return advanceLimit(closed.map((p) => byPeriod.get(p.id) ?? 0));
}

export async function createAdvance(propertyId: string, input: AdvanceInput, actor: Actor, save?: SaveIdempotent): Promise<Result<AdvanceResult>> {
  const uploads = await checkCashOut(propertyId, input);
  if (isFail(uploads)) return uploads;
  return inTransaction(async (tx) => {
    const owner = await lockOwner(tx, propertyId, input.ownerId);
    const period = await latestOpenPeriod(tx, propertyId);
    const limit = await advanceLimitFor(tx, propertyId, input.ownerId);
    const flagged = limit !== null && input.amountPaisa > limit;
    const row = await insertEntry(
      tx,
      propertyId,
      input.ownerId,
      period.id,
      {
        type: "ADVANCE",
        amountPaisa: -input.amountPaisa,
        date: input.date,
        fundAccountId: input.fundAccountId,
        method: input.method,
        referenceNo: input.referenceNo,
        note: input.reason,
        isSelf: owner!.user_id === actor.id,
        flagged,
      },
      actor,
      "ledger.advance_created",
      input.reason,
    );
    await linkAttachments(tx, propertyId, row.id, uploads, actor, "owner_ledger_entry");
    const warnings = await cashWarnings(tx, propertyId, input.fundAccountId, input.amountPaisa);
    if (flagged) warnings.unshift({ code: "ADVANCE_OVER_LIMIT", limitPaisa: limit! });
    const data: AdvanceResult = { entry: (await withFiles(tx, [row]))[0], balancePaisa: await ownerBalance(tx, input.ownerId), warnings };
    await save?.(tx, data);
    return data;
  });
}

// ─── F13 Void a payout or advance ───

export type VoidResult = { entry: LedgerEntryDto; reversal: LedgerEntryDto; balancePaisa: number };

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

export async function voidLedgerEntry(propertyId: string, id: string, reason: string, actor: Actor): Promise<Result<VoidResult>> {
  const found = await prisma.ownerLedgerEntry.findFirst({ where: { id, propertyId }, select: { ownerId: true } });
  if (!found) return failWith("NOT_FOUND");
  try {
    return await inTransaction(async (tx) => {
      await lockOwner(tx, propertyId, found.ownerId);
      // Re-read under the owner lock: a racing void has committed by now.
      const original = await tx.ownerLedgerEntry.findUniqueOrThrow({ where: { id }, include: ENTRY_INCLUDE });
      if (original.type !== "PAYOUT" && original.type !== "ADVANCE") throw new Abort(failWith("NOT_VOIDABLE"));
      if (original.voidedAt) throw new Abort(failWith("ALREADY_VOIDED"));
      const period = await latestOpenPeriod(tx, propertyId);
      const voided = await tx.ownerLedgerEntry.update({
        where: { id },
        data: { voidedAt: now(), voidedById: actor.id, voidReason: reason },
        include: ENTRY_INCLUDE,
      });
      const reversal = await tx.ownerLedgerEntry.create({
        data: {
          propertyId,
          ownerId: original.ownerId,
          periodId: period.id,
          type: "REVERSAL",
          amountPaisa: -original.amountPaisa,
          entryDate: dateOf(todayIsoInDhaka()),
          fundAccountId: original.fundAccountId,
          method: original.method,
          referenceNo: original.referenceNo,
          note: reason,
          reversesId: original.id,
          createdById: actor.id,
        },
        include: ENTRY_INCLUDE,
      });
      await audit(tx, {
        actorId: actor.id,
        action: "ledger.voided",
        entityType: "owner_ledger_entry",
        entityId: id,
        before: { voided: false },
        after: { voided: true, reversalId: reversal.id, amountPaisa: Number(reversal.amountPaisa) },
        reason,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      const [entry, rev] = await entryDtos(tx, [voided, reversal]);
      return { entry, reversal: rev, balancePaisa: await ownerBalance(tx, original.ownerId) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return failWith("ALREADY_VOIDED");
    throw err;
  }
}

// ─── F14 Balance adjustment ───

export type AdjustmentInput = { ownerId: string; amountPaisa: number; referenceMonth: string; reason: string };

export async function createOwnerAdjustment(propertyId: string, input: AdjustmentInput, actor: Actor, save?: SaveIdempotent): Promise<Result<{ entry: LedgerEntryDto; balancePaisa: number }>> {
  const owner = await prisma.owner.findFirst({ where: { id: input.ownerId, propertyId }, select: { id: true } });
  if (!owner) return fieldFail("ownerId", "Pick an owner.");
  const reference = await prisma.period.findUnique({ where: { propertyId_month: { propertyId, month: monthDate(input.referenceMonth) } }, select: { id: true } });
  if (!reference) return fieldFail("referenceMonth", "Pick a month the house has records for.");
  return inTransaction(async (tx) => {
    await lockOwner(tx, propertyId, input.ownerId);
    const period = await latestOpenPeriod(tx, propertyId);
    if (input.referenceMonth > period.month) throw new Abort(fieldFail("referenceMonth", "The reference month can't be after the open month."));
    const row = await insertEntry(
      tx,
      propertyId,
      input.ownerId,
      period.id,
      { type: "ADJUSTMENT", amountPaisa: input.amountPaisa, date: todayIsoInDhaka(), note: input.reason, referencePeriodId: reference.id },
      actor,
      "ledger.adjustment_created",
      input.reason,
    );
    const data = { entry: toEntryDto(row), balancePaisa: await ownerBalance(tx, input.ownerId) };
    await save?.(tx, data);
    return data;
  });
}

// ─── F3 Statement ───

export type StatementDto = {
  owner: { id: string; displayName: string; units: number; sharePercent: number };
  from: string;
  to: string;
  broughtForwardPaisa: number;
  rows: (LedgerEntryDto & { runningPaisa: number })[];
  closingPaisa: number;
  totals: Partial<Record<LedgerType, number>>;
};

/** `to` = "latest" or a month key; entries in posting order (month, date, creation). */
export async function ownerStatement(
  propertyId: string,
  owner: { id: string; displayName: string; units: number; sharePercent: number },
  from: string,
  to: string,
): Promise<StatementDto> {
  const rows = await prisma.ownerLedgerEntry.findMany({
    where: { propertyId, ownerId: owner.id },
    include: ENTRY_INCLUDE,
    orderBy: [{ period: { month: "asc" } }, { entryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const s = statement(await entryDtos(prisma, rows), from, to === "latest" ? null : to);
  return { owner, from, to, ...s };
}
