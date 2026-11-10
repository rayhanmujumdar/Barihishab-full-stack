// Bookkeeper's desk (Home PRD F5, G8, G9, Rule 8, Rule 10). Each tile reads
// the same source its own page uses; reconciliation follows design D5.
import { reminderKinds } from "@/lib/accounting/requests";
import { reconcile, type Reconciliation } from "@/lib/accounting/reconciliation";
import { todayIsoInDhaka } from "@/lib/clock";
import { periodTotals } from "@/lib/distribution/month-data";
import { reserveBalance } from "@/lib/distribution/reserve-service";
import { readSnapshot } from "@/lib/distribution/snapshot";
import { activeLoans } from "@/lib/loans/loan-service";
import { listFunds } from "@/lib/master-data/fund-service";
import { balancesByOwner } from "@/lib/owners/owner-service";
import { prisma } from "@/lib/prisma";
import { openComplaintsCount } from "./notices";

export type DeskDto = {
  fund: { totalPaisa: number; accounts: { id: string; name: string; type: "CASH" | "BANK" | "WALLET"; balancePaisa: number }[] };
  reconciliation: Reconciliation;
  pending: { count: number; over3Days: number };
  openComplaints: number;
  invites: { waiting: number; expired: number };
};

const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);

/** Over every open month: income − expenses not paid from the reserve. */
async function openNet(propertyId: string): Promise<number> {
  const open = await prisma.period.findMany({ where: { propertyId, status: "OPEN" }, select: { id: true } });
  const totals = await Promise.all(open.map((p) => periodTotals(prisma, p.id)));
  return sum(totals.map((t) => t.incomePaisa - t.expensePaisa));
}

/** Deficit carried out of the latest closed month (0 when it has no snapshot). */
async function deficitCarried(propertyId: string): Promise<number> {
  const last = await prisma.period.findFirst({ where: { propertyId, status: "CLOSED" }, orderBy: { month: "desc" }, select: { snapshot: true } });
  return readSnapshot(last?.snapshot)?.deficitCarriedPaisa ?? 0;
}

async function pendingCounts(propertyId: string): Promise<DeskDto["pending"]> {
  const rows = await prisma.moneyRequest.findMany({ where: { propertyId, status: "PENDING" }, select: { status: true, createdAt: true, neededBy: true } });
  const today = todayIsoInDhaka();
  const over3Days = rows.filter((r) => reminderKinds({ status: r.status, askedOn: todayIsoInDhaka(r.createdAt), neededBy: r.neededBy.toISOString().slice(0, 10) }, today).includes("PENDING_3_DAYS")).length;
  return { count: rows.length, over3Days };
}

/** INVITED users, and how many of their newest invite links have expired. */
async function inviteCounts(): Promise<DeskDto["invites"]> {
  const users = await prisma.user.findMany({
    where: { status: "INVITED" },
    select: { authTokens: { where: { type: "INVITE" }, orderBy: { createdAt: "desc" }, take: 1, select: { expiresAt: true } } },
  });
  const now = Date.now();
  return { waiting: users.length, expired: users.filter((u) => u.authTokens[0] && u.authTokens[0].expiresAt.getTime() < now).length };
}

export async function deskFigures(propertyId: string): Promise<DeskDto> {
  const [funds, balances, reserve, net, deficit, loans, pending, invites, complaints] = await Promise.all([
    listFunds(propertyId, { active: true }),
    balancesByOwner(prisma, propertyId),
    reserveBalance(prisma, propertyId),
    openNet(propertyId),
    deficitCarried(propertyId),
    activeLoans(prisma, propertyId),
    pendingCounts(propertyId),
    inviteCounts(),
    openComplaintsCount(propertyId),
  ]);
  const totalPaisa = sum(funds.map((f) => f.balancePaisa));
  return {
    fund: { totalPaisa, accounts: funds.map((f) => ({ id: f.id, name: f.name, type: f.type, balancePaisa: f.balancePaisa })) },
    reconciliation: reconcile({
      fundPaisa: totalPaisa,
      ownerBalancesPaisa: sum(balances.values()),
      reservePaisa: reserve,
      openNetPaisa: net,
      deficitCarriedPaisa: deficit,
      loansOutstandingPaisa: sum(loans.map((l) => l.outstandingPaisa)),
    }),
    pending,
    openComplaints: complaints,
    invites,
  };
}
