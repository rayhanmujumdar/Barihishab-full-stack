// Fund accounts (MST-02, FND-01). Balances are computed from entries on
// every read — never stored (project rule: balances are computed).
import type { Prisma } from "@/lib/generated/prisma/client";
import { fundBalance } from "@/lib/accounting/totals";
import { audit } from "@/lib/audit";
import { diffFields } from "@/lib/diff";
import { failWith, type Actor, type Result } from "@/lib/api/result";
import { prisma } from "@/lib/prisma";
import { toFundDto, type FundAccountDto } from "./dto";

type Db = Prisma.TransactionClient | typeof prisma;

export type FundInput = { name: string; type: "CASH" | "BANK" | "WALLET"; openingBalancePaisa: number; openingDate: string };
export type FundPatch = Partial<FundInput> & { isActive?: boolean };

type Movement = { income: number; expense: number; ledger: number; loans: number };
const NO_MOVES: Movement = { income: 0, expense: 0, ledger: 0, loans: 0 };

/**
 * Per fund account: Σ non-voided income / expense, Σ owner-ledger moves
 * (all of them — voided payouts are cancelled by their reversals) and
 * Σ principal of ACTIVE loans disbursed from it.
 */
export async function fundMovements(db: Db, propertyId: string, fundIds?: string[]) {
  const fundFilter = fundIds ? { fundAccountId: { in: fundIds } } : {};
  // Sequential on purpose: `db` may be a transaction client (one connection).
  const txns = await db.houseTransaction.groupBy({ by: ["fundAccountId", "kind"], where: { propertyId, voidedAt: null, ...fundFilter }, _sum: { amountPaisa: true } });
  const ledger = await db.ownerLedgerEntry.groupBy({
    by: ["fundAccountId"],
    where: { propertyId, fundAccountId: fundIds ? { in: fundIds } : { not: null } },
    _sum: { amountPaisa: true },
  });
  // Every disbursed loan left the fund, whatever its status now; deductions
  // on close move no cash (Distribution design D1).
  const loans = await db.loan.groupBy({ by: ["fundAccountId"], where: { propertyId, ...fundFilter }, _sum: { principalPaisa: true } });
  const map = new Map<string, Movement>();
  const at = (id: string) => map.get(id) ?? map.set(id, { ...NO_MOVES }).get(id)!;
  for (const g of txns) at(g.fundAccountId)[g.kind === "INCOME" ? "income" : "expense"] += Number(g._sum.amountPaisa ?? 0);
  for (const g of ledger) if (g.fundAccountId) at(g.fundAccountId).ledger += Number(g._sum.amountPaisa ?? 0);
  for (const g of loans) at(g.fundAccountId).loans += Number(g._sum.principalPaisa ?? 0);
  return map;
}

const balanceFrom = (openingPaisa: number, m: Movement = NO_MOVES) => fundBalance(openingPaisa, m.income, m.expense, m.ledger, m.loans);

/** Current balance of one account (used by warnings and deactivation). */
export async function balanceOf(db: Db, propertyId: string, fundId: string, openingPaisa?: number): Promise<number> {
  const fund = openingPaisa === undefined ? await db.fundAccount.findUniqueOrThrow({ where: { id: fundId } }) : null;
  const m = (await fundMovements(db, propertyId, [fundId])).get(fundId);
  return balanceFrom(openingPaisa ?? Number(fund!.openingBalancePaisa), m);
}

/** House Fund = Σ balances of every active fund account (PAY-04). */
export async function houseFundBalance(db: Db, propertyId: string): Promise<number> {
  const rows = await db.fundAccount.findMany({ where: { propertyId, isActive: true } });
  const moves = await fundMovements(db, propertyId);
  return rows.reduce((sum, f) => sum + balanceFrom(Number(f.openingBalancePaisa), moves.get(f.id)), 0);
}

export async function listFunds(propertyId: string, opts: { active?: boolean } = {}): Promise<FundAccountDto[]> {
  const [rows, moves] = await Promise.all([
    prisma.fundAccount.findMany({
      where: { propertyId, ...(opts.active === undefined ? {} : { isActive: opts.active }) },
      orderBy: [{ createdAt: "asc" }],
    }),
    fundMovements(prisma, propertyId),
  ]);
  return rows.map((f) => toFundDto(f, balanceFrom(Number(f.openingBalancePaisa), moves.get(f.id))));
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function createFund(propertyId: string, input: FundInput, actor: Actor): Promise<Result<{ fundAccount: FundAccountDto }>> {
  const fundAccount = await prisma.$transaction(async (tx) => {
    const row = await tx.fundAccount.create({
      data: { propertyId, name: input.name, type: input.type, openingBalancePaisa: BigInt(input.openingBalancePaisa), openingDate: toDate(input.openingDate) },
    });
    const dto = toFundDto(row, input.openingBalancePaisa);
    await audit(tx, { actorId: actor.id, action: "fund_account.created", entityType: "fund_account", entityId: row.id, after: dto, ip: actor.ip, userAgent: actor.userAgent });
    return dto;
  });
  return { ok: true, fundAccount };
}

export async function updateFund(propertyId: string, id: string, patch: FundPatch, actor: Actor): Promise<Result<{ fundAccount: FundAccountDto }>> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.fundAccount.findFirst({ where: { id, propertyId } });
    if (!current) return failWith("NOT_FOUND");
    const opening = patch.openingBalancePaisa ?? Number(current.openingBalancePaisa);
    const balance = await balanceOf(tx, propertyId, id, opening);
    const before = toFundDto(current, balance);
    const { balancePaisa: _b, id: _i, ...comparable } = before;
    const change = diffFields(comparable, patch);
    if (!change) return { ok: true as const, fundAccount: before };
    if (patch.isActive === false && current.isActive && balance !== 0) return failWith("FUND_NOT_EMPTY");
    const row = await tx.fundAccount.update({
      where: { id },
      data: {
        ...patch,
        ...(patch.openingBalancePaisa === undefined ? {} : { openingBalancePaisa: BigInt(patch.openingBalancePaisa) }),
        ...(patch.openingDate === undefined ? {} : { openingDate: toDate(patch.openingDate) }),
      },
    });
    await audit(tx, { actorId: actor.id, action: "fund_account.updated", entityType: "fund_account", entityId: id, ...change, ip: actor.ip, userAgent: actor.userAgent });
    return { ok: true as const, fundAccount: toFundDto(row, balance) };
  });
}
