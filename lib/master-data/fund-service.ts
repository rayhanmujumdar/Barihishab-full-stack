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

/** Σ non-voided income and expense per fund account. */
export async function fundMovements(db: Db, propertyId: string, fundIds?: string[]) {
  const groups = await db.houseTransaction.groupBy({
    by: ["fundAccountId", "kind"],
    where: { propertyId, voidedAt: null, ...(fundIds ? { fundAccountId: { in: fundIds } } : {}) },
    _sum: { amountPaisa: true },
  });
  const map = new Map<string, { income: number; expense: number }>();
  for (const g of groups) {
    const m = map.get(g.fundAccountId) ?? { income: 0, expense: 0 };
    if (g.kind === "INCOME") m.income += Number(g._sum.amountPaisa ?? 0);
    else m.expense += Number(g._sum.amountPaisa ?? 0);
    map.set(g.fundAccountId, m);
  }
  return map;
}

/** Current balance of one account (used by warnings and deactivation). */
export async function balanceOf(db: Db, propertyId: string, fundId: string, openingPaisa?: number): Promise<number> {
  const fund = openingPaisa === undefined ? await db.fundAccount.findUniqueOrThrow({ where: { id: fundId } }) : null;
  const m = (await fundMovements(db, propertyId, [fundId])).get(fundId) ?? { income: 0, expense: 0 };
  return fundBalance(openingPaisa ?? Number(fund!.openingBalancePaisa), m.income, m.expense);
}

export async function listFunds(propertyId: string, opts: { active?: boolean } = {}): Promise<FundAccountDto[]> {
  const [rows, moves] = await Promise.all([
    prisma.fundAccount.findMany({
      where: { propertyId, ...(opts.active === undefined ? {} : { isActive: opts.active }) },
      orderBy: [{ createdAt: "asc" }],
    }),
    fundMovements(prisma, propertyId),
  ]);
  return rows.map((f) => {
    const m = moves.get(f.id) ?? { income: 0, expense: 0 };
    return toFundDto(f, fundBalance(Number(f.openingBalancePaisa), m.income, m.expense));
  });
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
