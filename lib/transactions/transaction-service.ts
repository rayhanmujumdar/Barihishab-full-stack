// Income & expenses (Income & Expenses PRD §3, §7, §10). Every write:
// period share-lock → rules → one DB transaction (row + audit + idempotency key).
import type { Prisma } from "@/lib/generated/prisma/client";
import { toPeriodTotals, type PeriodTotals } from "@/lib/accounting/totals";
import { type SaveIdempotent } from "@/lib/api/idempotency";
import { Abort, inTransaction as runInTransaction } from "@/lib/api/in-transaction";
import { failWith, fieldFail, isFail, type Actor, type Fail, type Result } from "@/lib/api/result";
import { audit, type AuditAction } from "@/lib/audit";
import { todayIsoInDhaka } from "@/lib/clock";
import { diffFields } from "@/lib/diff";
import { balanceOf } from "@/lib/master-data/fund-service";
import { ensureCurrentPeriod, findPeriod, lockPeriod, type PeriodDto } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { attachmentCounts, linkAttachments, listAttachments, prepareAttachments, type AttachmentDto } from "@/lib/attachments/attachment-service";
import { auditView, toTxnDto, TXN_INCLUDE, type TxnDto } from "./dto";
import { checkEntry, isAfterTomorrow, MSG } from "./rules";
import { buildWarnings, type Warning } from "./warnings";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
type Kind = "INCOME" | "EXPENSE";

export type EntryFields = {
  period: string;
  categoryId: string;
  amountPaisa: number;
  txnDate: string;
  fundAccountId: string;
  unitId?: string | null;
  vendor?: string | null;
  description?: string | null;
  fromReserve?: boolean;
  referencePeriod?: string | null;
};
export type CreateInput = EntryFields & { kind: Kind; attachmentIds?: string[] };
export type CorrectInput = Partial<EntryFields> & { reason: string };
export type AdjustmentInput = Omit<EntryFields, "categoryId" | "unitId" | "referencePeriod"> & { kind: Kind; referencePeriod: string; reason: string };
export type WriteResult = { transaction: TxnDto; warnings: Warning[]; periodTotals: PeriodTotals };

const inTransaction = <T>(fn: (tx: Tx) => Promise<T>) => runInTransaction(fn, { timeout: 20_000 });

async function lockOpen(tx: Tx, periodId: string) {
  const p = await lockPeriod(tx, periodId);
  if (!p || p.status !== "OPEN") throw new Abort(failWith("PERIOD_CLOSED"));
  return p;
}

/**
 * Row-locks an entry for the rest of the transaction so two corrections or
 * voids of the same entry run one after the other, never interleaved.
 */
async function lockEntry(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT 1 FROM house_transactions WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.houseTransaction.findUniqueOrThrow({ where: { id }, include: TXN_INCLUDE });
}

async function openPeriod(propertyId: string, month: string): Promise<PeriodDto | Fail> {
  const period = await findPeriod(prisma, propertyId, month);
  if (!period) return fieldFail("period", MSG.periodMissing);
  if (period.status !== "OPEN") return failWith("PERIOD_CLOSED");
  return period;
}


async function resolveRefs(db: Db, propertyId: string, f: { categoryId: string; unitId?: string | null; fundAccountId: string; referencePeriod?: string | null }) {
  const [category, unit, fund, reference] = await Promise.all([
    db.category.findFirst({ where: { id: f.categoryId, propertyId } }),
    f.unitId ? db.unit.findFirst({ where: { id: f.unitId, propertyId } }) : null,
    db.fundAccount.findFirst({ where: { id: f.fundAccountId, propertyId } }),
    f.referencePeriod ? findPeriod(db, propertyId, f.referencePeriod) : null,
  ]);
  return { category, unit, fund, reference };
}

export async function periodTotals(db: Db, periodId: string): Promise<PeriodTotals> {
  const groups = await db.houseTransaction.groupBy({
    by: ["kind", "fromReserve"],
    where: { periodId, voidedAt: null },
    _sum: { amountPaisa: true },
    _count: { _all: true },
  });
  return toPeriodTotals(groups.map((g) => ({ kind: g.kind, fromReserve: g.fromReserve, sum: Number(g._sum.amountPaisa ?? 0), count: g._count._all })));
}

async function warningsFor(tx: Tx, propertyId: string, t: TxnDto, periodId: string): Promise<Warning[]> {
  // Sequential on purpose: one transaction = one connection, no concurrent queries.
  const others = { periodId, voidedAt: null, id: { not: t.id } };
  const rent =
    t.category.code === "RENT" && t.unitId ? await tx.houseTransaction.count({ where: { ...others, unitId: t.unitId, category: { code: "RENT" } } }) : 0;
  const dup = await tx.houseTransaction.count({
    where: { ...others, kind: t.kind, categoryId: t.categoryId, amountPaisa: BigInt(t.amountPaisa), txnDate: new Date(`${t.txnDate}T00:00:00Z`) },
  });
  const balance = await balanceOf(tx, propertyId, t.fundAccountId);
  return buildWarnings({
    rentAlreadyRecorded: rent > 0,
    possibleDuplicate: dup > 0,
    fundAccountId: t.fundAccountId,
    fundBalancePaisa: balance,
    txnDate: t.txnDate,
    periodMonth: t.period,
  });
}

const rentDescription = (unit: { name: string; tenantName: string | null }) => (unit.tenantName ? `${unit.name} · ${unit.tenantName}` : unit.name);

// ─── Create (INC-01/02, EXP-01) and Adjustment (LCK-02) ───

type WriteOpts = {
  mode: "manual" | "adjustment";
  canAdjust: boolean;
  save?: SaveIdempotent;
  reason?: string;
};

async function writeNew(propertyId: string, input: CreateInput, actor: Actor, opts: WriteOpts): Promise<Result<WriteResult>> {
  await ensureCurrentPeriod(propertyId);
  const period = await openPeriod(propertyId, input.period);
  if (isFail(period)) return period;

  const refs = await resolveRefs(prisma, propertyId, input);
  const fields = checkEntry({
    kind: input.kind,
    category: refs.category,
    unitId: input.unitId ?? null,
    unit: refs.unit,
    fund: refs.fund,
    referencePeriod: input.referencePeriod ?? null,
    reference: refs.reference,
    periodMonth: period.month,
    txnDate: input.txnDate,
    today: todayIsoInDhaka(),
    fromReserve: input.fromReserve ?? false,
    mode: opts.mode,
  });
  if (fields) return failWith("VALIDATION_FAILED", fields);
  if (refs.category!.code === "ARREAR" && !opts.canAdjust) return failWith("FORBIDDEN");

  const uploads = await prepareAttachments(propertyId, input.attachmentIds ?? [], 0);
  if (isFail(uploads)) return uploads;

  const description = input.description || (refs.category!.code === "RENT" && refs.unit ? rentDescription(refs.unit) : null);
  const action: AuditAction = opts.mode === "adjustment" ? "transaction.adjustment_created" : "transaction.created";

  return inTransaction(async (tx) => {
    await lockOpen(tx, period.id);
    const row = await tx.houseTransaction.create({
      data: {
        propertyId,
        periodId: period.id,
        kind: input.kind,
        categoryId: input.categoryId,
        unitId: input.unitId ?? null,
        amountPaisa: BigInt(input.amountPaisa),
        txnDate: new Date(`${input.txnDate}T00:00:00Z`),
        fundAccountId: input.fundAccountId,
        vendor: input.vendor || null,
        description,
        fromReserve: input.fromReserve ?? false,
        referencePeriodId: refs.reference?.id ?? null,
        source: opts.mode === "adjustment" ? "ADJUSTMENT" : "MANUAL",
        createdById: actor.id,
      },
      include: TXN_INCLUDE,
    });
    await linkAttachments(tx, propertyId, row.id, uploads, actor);
    const transaction = toTxnDto(row, uploads.length);
    await audit(tx, { actorId: actor.id, action, entityType: "house_transaction", entityId: row.id, after: transaction, reason: opts.reason ?? null, ip: actor.ip, userAgent: actor.userAgent });
    const data: WriteResult = { transaction, warnings: await warningsFor(tx, propertyId, transaction, period.id), periodTotals: await periodTotals(tx, period.id) };
    await opts.save?.(tx, data);
    return data;
  });
}

export function createTransaction(propertyId: string, input: CreateInput, actor: Actor, opts: { canAdjust: boolean; save?: SaveIdempotent }) {
  return writeNew(propertyId, input, actor, { mode: "manual", ...opts });
}

export async function createAdjustment(propertyId: string, input: AdjustmentInput, actor: Actor, save?: SaveIdempotent) {
  const category = await prisma.category.findUniqueOrThrow({
    where: { propertyId_code: { propertyId, code: input.kind === "INCOME" ? "ADJUSTMENT_INC" : "ADJUSTMENT_EXP" } },
  });
  const { reason, ...rest } = input;
  return writeNew(propertyId, { ...rest, categoryId: category.id, unitId: null }, actor, { mode: "adjustment", canAdjust: true, save, reason });
}

// ─── Correct (COR-01/02) and Void (VOD-01/02) ───

export async function correctTransaction(propertyId: string, id: string, input: CorrectInput, actor: Actor, opts: { canAdjust: boolean }): Promise<Result<WriteResult>> {
  const current = await prisma.houseTransaction.findFirst({ where: { id, propertyId }, include: TXN_INCLUDE });
  if (!current) return failWith("NOT_FOUND");
  if (current.source === "LOAN_WRITE_OFF") return failWith("NOT_EDITABLE");
  if (current.voidedAt) return failWith("ALREADY_VOIDED");
  if (current.period.status !== "OPEN") return failWith("PERIOD_CLOSED");

  const { reason, ...patch } = input;
  const before = auditView(toTxnDto(current));
  const change = diffFields(before, patch);
  if (!change) return fieldFail("_", MSG.nothingChanged);
  const merged = { ...before, ...change.after };

  const target = merged.period === before.period ? { id: current.periodId, month: before.period, status: "OPEN" as const } : await openPeriod(propertyId, merged.period);
  if (isFail(target)) return target;

  const refs = await resolveRefs(prisma, propertyId, merged);
  // Unchanged references stay valid even if deactivated since (G12).
  const keep = <T extends { isActive: boolean } | null>(changed: boolean, row: T) => (changed || !row ? row : { ...row, isActive: true });
  const fields = checkEntry({
    kind: current.kind,
    category: keep("categoryId" in change.after, refs.category),
    unitId: merged.unitId,
    unit: keep("unitId" in change.after, refs.unit),
    fund: keep("fundAccountId" in change.after, refs.fund),
    referencePeriod: merged.referencePeriod,
    reference: refs.reference,
    periodMonth: target.month,
    txnDate: merged.txnDate,
    today: todayIsoInDhaka(),
    fromReserve: merged.fromReserve,
    mode: current.source === "ADJUSTMENT" ? "adjustment" : "manual",
  });
  if (fields) return failWith("VALIDATION_FAILED", fields);
  if (refs.category!.code === "ARREAR" && "categoryId" in change.after && !opts.canAdjust) return failWith("FORBIDDEN");

  return inTransaction(async (tx) => {
    await lockOpen(tx, current.periodId);
    if (target.id !== current.periodId) await lockOpen(tx, target.id);
    const fresh = await lockEntry(tx, id);
    if (fresh.voidedAt) throw new Abort(failWith("ALREADY_VOIDED"));
    // The diff, checks and audit "before" were built from `current`; refuse if it went stale.
    if (JSON.stringify(auditView(toTxnDto(fresh))) !== JSON.stringify(before)) throw new Abort(failWith("ENTRY_CHANGED"));
    const a = change.after;
    const row = await tx.houseTransaction.update({
      where: { id },
      data: {
        ...(a.period === undefined ? {} : { periodId: target.id }),
        ...(a.categoryId === undefined ? {} : { categoryId: a.categoryId }),
        ...(a.unitId === undefined ? {} : { unitId: a.unitId }),
        ...(a.amountPaisa === undefined ? {} : { amountPaisa: BigInt(a.amountPaisa) }),
        ...(a.txnDate === undefined ? {} : { txnDate: new Date(`${a.txnDate}T00:00:00Z`) }),
        ...(a.fundAccountId === undefined ? {} : { fundAccountId: a.fundAccountId }),
        ...(a.vendor === undefined ? {} : { vendor: a.vendor || null }),
        ...(a.description === undefined ? {} : { description: a.description || null }),
        ...(a.fromReserve === undefined ? {} : { fromReserve: a.fromReserve }),
        ...(a.referencePeriod === undefined ? {} : { referencePeriodId: refs.reference?.id ?? null }),
        isCorrected: true,
        updatedById: actor.id,
      },
      include: TXN_INCLUDE,
    });
    const count = (await attachmentCounts(tx, [id])).get(id) ?? 0;
    const transaction = toTxnDto(row, count);
    await audit(tx, { actorId: actor.id, action: "transaction.updated", entityType: "house_transaction", entityId: id, ...change, reason, ip: actor.ip, userAgent: actor.userAgent });
    return { transaction, warnings: await warningsFor(tx, propertyId, transaction, target.id), periodTotals: await periodTotals(tx, target.id) };
  });
}

export async function voidTransaction(propertyId: string, id: string, reason: string, actor: Actor): Promise<Result<{ transaction: TxnDto; periodTotals: PeriodTotals }>> {
  const current = await prisma.houseTransaction.findFirst({ where: { id, propertyId } });
  if (!current) return failWith("NOT_FOUND");
  // Its fund offset lives on the loan; it changes only with the loan (Advances & Loans F10).
  if (current.source === "LOAN_WRITE_OFF") return failWith("NOT_EDITABLE");
  return inTransaction(async (tx) => {
    await lockOpen(tx, current.periodId);
    const fresh = await lockEntry(tx, id);
    if (fresh.voidedAt) throw new Abort(failWith("ALREADY_VOIDED"));
    const row = await tx.houseTransaction.update({
      where: { id },
      data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
      include: TXN_INCLUDE,
    });
    await audit(tx, { actorId: actor.id, action: "transaction.voided", entityType: "house_transaction", entityId: id, reason, ip: actor.ip, userAgent: actor.userAgent });
    const count = (await attachmentCounts(tx, [id])).get(id) ?? 0;
    return { transaction: toTxnDto(row, count), periodTotals: await periodTotals(tx, current.periodId) };
  });
}

// ─── Generate rent (INC-04) ───

export type RentRow = { unitId: string; unit: string; tenant: string | null; amountPaisa: number; fundAccountId: string | null; selected: true };

async function paidUnitIds(db: Db, periodId: string): Promise<Set<string>> {
  const rows = await db.houseTransaction.findMany({
    where: { periodId, voidedAt: null, unitId: { not: null }, category: { code: "RENT" } },
    select: { unitId: true },
    distinct: ["unitId"],
  });
  return new Set(rows.map((r) => r.unitId!));
}

export async function previewRent(propertyId: string, month: string): Promise<Result<{ period: string; rows: RentRow[] }>> {
  const period = await openPeriod(propertyId, month);
  if (isFail(period)) return period;
  const [units, paid] = await Promise.all([
    prisma.unit.findMany({ where: { propertyId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    paidUnitIds(prisma, period.id),
  ]);
  const rows = units
    .filter((u) => !paid.has(u.id))
    .map((u) => ({ unitId: u.id, unit: u.name, tenant: u.tenantName, amountPaisa: Number(u.rentPaisa), fundAccountId: u.defaultFundAccountId, selected: true as const }));
  return { ok: true, period: month, rows };
}

export type GenerateInput = { period: string; txnDate: string; rows: { unitId: string; amountPaisa: number; fundAccountId: string }[] };
export type GenerateResult = { created: number; transactions: TxnDto[]; skipped: { unitId: string; unit: string }[]; periodTotals: PeriodTotals };

export async function generateRent(propertyId: string, input: GenerateInput, actor: Actor, save?: SaveIdempotent): Promise<Result<GenerateResult>> {
  const period = await openPeriod(propertyId, input.period);
  if (isFail(period)) return period;
  if (isAfterTomorrow(input.txnDate, todayIsoInDhaka())) return fieldFail("txnDate", MSG.future);
  const [rent, units, funds] = await Promise.all([
    prisma.category.findUniqueOrThrow({ where: { propertyId_code: { propertyId, code: "RENT" } } }),
    prisma.unit.findMany({ where: { propertyId, id: { in: input.rows.map((r) => r.unitId) } } }),
    prisma.fundAccount.findMany({ where: { propertyId, id: { in: input.rows.map((r) => r.fundAccountId) }, isActive: true } }),
  ]);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const fundIds = new Set(funds.map((f) => f.id));
  const fields: Record<string, string> = {};
  input.rows.forEach((r, i) => {
    if (!unitById.get(r.unitId)?.isActive) fields[`rows.${i}.unitId`] = MSG.unit;
    if (!fundIds.has(r.fundAccountId)) fields[`rows.${i}.fundAccountId`] = MSG.fund;
  });
  if (Object.keys(fields).length) return failWith("VALIDATION_FAILED", fields);

  return inTransaction(async (tx) => {
    await lockOpen(tx, period.id);
    // The period lock is shared, so two generators could both see a unit as
    // unpaid. This exclusive per-month lock makes them run one at a time.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`generate-rent:${period.id}`}))`;
    const paid = await paidUnitIds(tx, period.id);
    const transactions: TxnDto[] = [];
    const skipped: GenerateResult["skipped"] = [];
    for (const r of input.rows) {
      const unit = unitById.get(r.unitId)!;
      if (paid.has(r.unitId)) {
        skipped.push({ unitId: r.unitId, unit: unit.name });
        continue;
      }
      const row = await tx.houseTransaction.create({
        data: {
          propertyId,
          periodId: period.id,
          kind: "INCOME",
          categoryId: rent.id,
          unitId: r.unitId,
          amountPaisa: BigInt(r.amountPaisa),
          txnDate: new Date(`${input.txnDate}T00:00:00Z`),
          fundAccountId: r.fundAccountId,
          description: rentDescription(unit),
          source: "GENERATED_RENT",
          createdById: actor.id,
        },
        include: TXN_INCLUDE,
      });
      transactions.push(toTxnDto(row));
    }
    if (transactions.length) {
      await audit(tx, {
        actorId: actor.id,
        action: "transaction.rent_generated",
        entityType: "period",
        entityId: period.id,
        after: {
          period: period.month,
          units: transactions.map((t) => t.unitName),
          count: transactions.length,
          totalPaisa: transactions.reduce((s, t) => s + t.amountPaisa, 0),
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    }
    const data: GenerateResult = { created: transactions.length, transactions, skipped, periodTotals: await periodTotals(tx, period.id) };
    await save?.(tx, data);
    return data;
  });
}

// ─── Reads (LST-01..05, DET-01, EXP-03) ───

export type ListQuery = { period: string; kind?: Kind; category?: string; cursor?: string; limit: number };

export async function listTransactions(propertyId: string, q: ListQuery): Promise<{ items: TxnDto[]; nextCursor: string | null; totalPaisa: number }> {
  const period = await findPeriod(prisma, propertyId, q.period);
  if (!period) return { items: [], nextCursor: null, totalPaisa: 0 };
  const byCategory = q.category && q.category !== "ALL";
  const where: Prisma.HouseTransactionWhereInput = {
    propertyId,
    periodId: period.id,
    ...(q.kind ? { kind: q.kind } : {}),
    ...(byCategory ? { category: { code: q.category } } : {}),
  };
  const [rows, sum] = await Promise.all([
    prisma.houseTransaction.findMany({
      where,
      include: TXN_INCLUDE,
      orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    // The tab total excludes From-Reserve expenses (§3.5); a category filter shows everything in it.
    prisma.houseTransaction.aggregate({ where: { ...where, voidedAt: null, ...(byCategory ? {} : { fromReserve: false }) }, _sum: { amountPaisa: true } }),
  ]);
  const page = rows.slice(0, q.limit);
  const counts = await attachmentCounts(prisma, page.map((r) => r.id));
  return {
    items: page.map((r) => toTxnDto(r, counts.get(r.id) ?? 0)),
    nextCursor: rows.length > q.limit ? page[page.length - 1].id : null,
    totalPaisa: Number(sum._sum.amountPaisa ?? 0),
  };
}

export type SummaryCategory = { id: string; kind: Kind; code: string; nameEn: string; nameBn: string; count: number; totalPaisa: number };

export async function periodSummary(propertyId: string, month: string) {
  const period = await findPeriod(prisma, propertyId, month);
  if (!period) return { period: month, status: null, totals: toPeriodTotals([]), categories: [] as SummaryCategory[] };
  const [totals, all, live] = await Promise.all([
    periodTotals(prisma, period.id),
    prisma.houseTransaction.groupBy({ by: ["categoryId"], where: { periodId: period.id }, _count: { _all: true } }),
    prisma.houseTransaction.groupBy({ by: ["categoryId"], where: { periodId: period.id, voidedAt: null }, _sum: { amountPaisa: true } }),
  ]);
  const sums = new Map(live.map((g) => [g.categoryId, Number(g._sum.amountPaisa ?? 0)]));
  const cats = await prisma.category.findMany({ where: { id: { in: all.map((g) => g.categoryId) } }, orderBy: [{ sortOrder: "asc" }] });
  const counts = new Map(all.map((g) => [g.categoryId, g._count._all]));
  return {
    period: month,
    status: period.status,
    totals,
    categories: cats.map((c) => ({ id: c.id, kind: c.kind, code: c.code, nameEn: c.nameEn, nameBn: c.nameBn, count: counts.get(c.id) ?? 0, totalPaisa: sums.get(c.id) ?? 0 })),
  };
}

export type HistoryItem = { action: string; at: string; actorName: string | null; before: unknown; after: unknown; reason: string | null };
export type TxnDetail = TxnDto & { recordedBy: string | null; tenantName: string | null; attachments: AttachmentDto[]; history: HistoryItem[] };

const HISTORY_ACTIONS = ["transaction.updated", "transaction.voided", "attachment.added", "attachment.removed"];
const CREATED_WITH_REASON = "transaction.adjustment_created";

export async function getTransactionDetail(propertyId: string, id: string): Promise<TxnDetail | null> {
  const row = await prisma.houseTransaction.findFirst({ where: { id, propertyId }, include: { ...TXN_INCLUDE, createdBy: true } });
  if (!row) return null;
  const [attachments, logs] = await Promise.all([
    listAttachments(prisma, id),
    prisma.auditLog.findMany({ where: { entityId: id, action: { in: [...HISTORY_ACTIONS, CREATED_WITH_REASON] } }, orderBy: { id: "asc" } }),
  ]);
  // An adjustment's reason lives on its creation audit row; show it on the created item.
  const createdReason = logs.find((l) => l.action === CREATED_WITH_REASON)?.reason ?? null;
  const changes = logs.filter((l) => l.action !== CREATED_WITH_REASON);
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((v): v is string => !!v))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } } }) : [];
  const names = new Map(actors.map((a) => [a.id, displayName(a)]));
  const recordedBy = displayName(row.createdBy);
  return {
    ...toTxnDto(row, attachments.length),
    recordedBy,
    tenantName: row.unit?.tenantName ?? null,
    attachments,
    history: [
      { action: "transaction.created", at: row.createdAt.toISOString(), actorName: recordedBy, before: null, after: null, reason: createdReason },
      ...changes.map((l) => ({
        action: l.action,
        at: l.createdAt.toISOString(),
        actorName: l.actorId ? (names.get(l.actorId) ?? null) : null,
        before: l.before,
        after: l.after,
        reason: l.reason,
      })),
    ],
  };
}

/** EXP-03: distinct vendors from this property's expenses, most used first. */
export async function vendorSuggestions(propertyId: string, q: string): Promise<string[]> {
  const prefix = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<{ vendor: string }[]>`
    SELECT vendor FROM house_transactions
    WHERE property_id = ${propertyId}::uuid AND kind = 'EXPENSE' AND vendor IS NOT NULL AND vendor ILIKE ${prefix}
    GROUP BY vendor ORDER BY count(*) DESC, vendor ASC LIMIT 10`;
  return rows.map((r) => r.vendor);
}
