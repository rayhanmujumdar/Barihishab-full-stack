// Advances & Loans PRD sample data on top of the Owners sample house (clock:
// 20 Oct 2026). Tanvir's L1 (৳35,000, disbursed June) comes from ownersWorld.
import * as loansRoute from "@/app/api/v1/loans/route";
import * as loanRoute from "@/app/api/v1/loans/[id]/route";
import * as repayRoute from "@/app/api/v1/loans/[id]/repayments/route";
import * as voidRoute from "@/app/api/v1/loans/[id]/repayments/[repaymentId]/void/route";
import * as cancelRoute from "@/app/api/v1/loans/[id]/cancel/route";
import * as writeOffRoute from "@/app/api/v1/loans/[id]/write-off/route";
import { balanceOf as balanceOf_ } from "@/lib/master-data/fund-service";
import { prisma } from "@/lib/prisma";
import { createFund, createLedgerEntry, createPeriod, setPeriodStatus } from "./factory";
import { apiRequest, json, params, type Login } from "./http";
import { moneyPost } from "./money";
import { ownersWorld } from "./owners";

export async function loansWorld() {
  const w = await ownersWorld();
  const house = await createFund(w.property.id, { name: "House cash", openingPaisa: 50000000 });
  const loan = await prisma.loan.findFirstOrThrow({ where: { ownerId: w.owners.tanvir.id } });
  /** A month that is CLOSED with these entitlements already posted (origin CLOSE). */
  const closedMonth = async (month: string, entitlements: Record<string, number>) => {
    const p = await createPeriod(w.property.id, month);
    for (const [ownerId, amountPaisa] of Object.entries(entitlements)) {
      await createLedgerEntry({ propertyId: w.property.id, ownerId, periodId: p.id, createdById: w.admin.id, type: "ENTITLEMENT", amountPaisa, entryDate: `${month}-28` });
    }
    await setPeriodStatus(p.id, "CLOSED");
    return p;
  };
  return { ...w, house, loan, closedMonth };
}
export type LoansWorld = Awaited<ReturnType<typeof loansWorld>>;

export const balanceOf = async (ownerId: string) =>
  Number((await prisma.ownerLedgerEntry.aggregate({ where: { ownerId }, _sum: { amountPaisa: true } }))._sum.amountPaisa ?? 0);

export const fundBalance = (w: LoansWorld, fundId: string) => balanceOf_(prisma, w.property.id, fundId);

export const createLoanApi = (login: Login, body: unknown, key?: string) => loansRoute.POST(moneyPost("/loans", login, body, key), params({}));
export const listLoans = (login: Login, query = "") => loansRoute.GET(apiRequest(`/loans${query}`, { login }), params({}));
export const getLoan = (login: Login, id: string) => loanRoute.GET(apiRequest(`/loans/${id}`, { login }), params({ id }));
export const patchLoan = (login: Login, id: string, body: unknown) => loanRoute.PATCH(apiRequest(`/loans/${id}`, { method: "PATCH", login, body }), params({ id }));
export const repay = (login: Login, id: string, body: unknown, key?: string) => repayRoute.POST(moneyPost(`/loans/${id}/repayments`, login, body, key), params({ id }));
export const voidRepayment = (login: Login, id: string, repaymentId: string, reason = "Recorded on the wrong loan") =>
  voidRoute.POST(apiRequest(`/loans/${id}/repayments/${repaymentId}/void`, { login, body: { reason } }), params({ id, repaymentId }));
export const cancelLoan = (login: Login, id: string, reason = "Recorded for the wrong owner") =>
  cancelRoute.POST(apiRequest(`/loans/${id}/cancel`, { login, body: { reason } }), params({ id }));
export const writeOff = (login: Login, id: string, reason = "Hardship agreed by the family") =>
  writeOffRoute.POST(apiRequest(`/loans/${id}/write-off`, { login, body: { reason } }), params({ id }));

export const data = async (res: Response) => (await json(res)).data;
