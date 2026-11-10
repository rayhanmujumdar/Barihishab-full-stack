// Local-only Advances & Loans fixtures for manual browser testing, on top of
// the people `pnpm db:seed:test-users` creates (test.tanvir, test.farzana,
// test.nasrin) and the Super Admin's own owner row (for a Self loan).
// Run with `pnpm db:seed:advances-loans`.
//
// Every row goes through the real services (createLoan, recordRepayment,
// voidRepayment, cancelLoan, setLoanInstallment, createAdvance, voidLedgerEntry),
// so loan numbers, fund moves, statuses, flags and audit rows are exactly what
// the app would produce. Everything posts in the latest OPEN month, dated
// within that month and never after today. Runs once: if the fixtures exist it
// does nothing. Same local-database guard as the test-user seed.
import "dotenv/config";
import type { Result } from "../lib/api/result";
import { todayIsoInDhaka } from "../lib/clock";
import { createLoan, setLoanInstallment } from "../lib/loans/loan-service";
import { cancelLoan, recordRepayment, voidRepayment } from "../lib/loans/repayment-service";
import { balanceOf } from "../lib/master-data/fund-service";
import { createAdvance, voidLedgerEntry } from "../lib/owners/ledger-service";
import { monthKey } from "../lib/periods/month";
import { prisma } from "../lib/prisma";
import { assertLocalTarget, type Env } from "./seed-test-users";

/** The first loan's reason doubles as the "already seeded" marker. */
export const MARKER_REASON = "Daughter's school admission";

type Actor = { id: string; ip: null; userAgent: string };
export type AdvancesLoansSeedResult = { skipped: boolean; rows: { what: string; owner: string; amount: string; result: string }[] };

const taka = (paisa: number) => `৳${(paisa / 100).toLocaleString("en-IN")}`;

function must<T>(r: Result<T>, what: string): T {
  if (!r.ok) throw new Error(`${what} failed: ${r.code}${r.fields ? ` ${JSON.stringify(r.fields)}` : ""}${r.message ? ` — ${r.message}` : ""}`);
  return r as T;
}

export async function runAdvancesLoansSeed(env: Env = process.env): Promise<AdvancesLoansSeedResult> {
  assertLocalTarget(env);
  const property = await prisma.property.findFirst({ orderBy: { createdAt: "asc" } });
  if (!property) throw new Error("No property yet — run `pnpm db:seed` first.");
  const propertyId = property.id;
  if (await prisma.loan.findFirst({ where: { propertyId, reason: MARKER_REASON } })) return { skipped: true, rows: [] };

  const open = await prisma.period.findFirst({ where: { propertyId, status: "OPEN" }, orderBy: { month: "desc" } });
  if (!open) throw new Error("No open month — open one in Distribution first; loans and advances post in an open month.");
  const month = monthKey(open.month);
  const today = todayIsoInDhaka();
  /** Day `d` of the open month, never after today (the services refuse future dates). */
  const day = (d: number) => {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    return iso < today ? iso : today;
  };

  // People: the test owners plus the Super Admin's own owner row (Self loan).
  const ownerOf = async (username: string) => {
    const o = await prisma.owner.findFirst({ where: { propertyId, user: { username } }, select: { id: true, displayName: true } });
    if (!o) throw new Error(`No owner linked to "${username}" — run \`pnpm db:seed:test-users\` first.`);
    return o;
  };
  const [tanvir, farzana, nasrin] = [await ownerOf("test.tanvir"), await ownerOf("test.farzana"), await ownerOf("test.nasrin")];
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, owners: { where: { propertyId }, select: { id: true, displayName: true } } },
  });
  const admin = admins.find((a) => a.owners.length) ?? admins[0];
  if (!admin) throw new Error("No active Super Admin — run `pnpm db:seed` first.");
  const self = admin.owners[0] ?? null;
  const actor: Actor = { id: admin.id, ip: null, userAgent: "seed:advances-loans" };

  // Funds: pay out from the richest active account, take cash back into the cash box.
  const funds = await prisma.fundAccount.findMany({ where: { propertyId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!funds.length) throw new Error("No active fund account — add one in Settings first.");
  const balances = new Map<string, number>();
  for (const f of funds) balances.set(f.id, await balanceOf(prisma, propertyId, f.id, Number(f.openingBalancePaisa)));
  const payFund = [...funds].sort((a, b) => balances.get(b.id)! - balances.get(a.id)!)[0];
  const cashFund = funds.find((f) => f.type === "CASH") ?? payFund;
  const out = payFund.type === "CASH" ? ({ method: "CASH" } as const) : ({ method: "BANK" } as const);
  const ref = (n: number) => (out.method === "CASH" ? null : `SEED-TRX-${5520 + n}`);

  const rows: AdvancesLoansSeedResult["rows"] = [];
  const log = (what: string, owner: string, paisa: number, result: string) => rows.push({ what, owner, amount: taka(paisa), result });

  const loan = async (n: number, o: { id: string; displayName: string }, paisa: number, d: number, reason: string, installmentPaisa: number | null = null) => {
    const r = must(
      await createLoan(propertyId, { ownerId: o.id, amountPaisa: paisa, date: day(d), fundAccountId: payFund.id, ...out, referenceNo: ref(n), reason, installmentPaisa }, actor),
      `Loan for ${o.displayName}`,
    );
    const tags = [r.loan.isSelf && "Self", r.loan.flagged && "flagged", installmentPaisa ? `instalment ${taka(installmentPaisa)}` : "manual"].filter(Boolean).join(", ");
    log(`L${r.loan.number} disbursed — ${reason}`, o.displayName, paisa, tags);
    return r.loan;
  };
  const cash = async (loanId: string, label: string, owner: string, paisa: number, d: number) => {
    const r = must(await recordRepayment(propertyId, loanId, { mode: "CASH", amountPaisa: paisa, date: day(d), fundAccountId: cashFund.id, method: "CASH" }, actor), `Repayment on ${label}`);
    log(`${label} repaid in cash`, owner, paisa, `${taka(r.loan.outstandingPaisa)} left · ${r.loan.status}`);
    return r;
  };

  // L1 · Tanvir — the PRD's school-admission loan: instalment, a cash repayment, then a lower instalment.
  const l1 = await loan(1, tanvir, 5_000_000, 2, MARKER_REASON, 500_000);
  await cash(l1.id, `L${l1.number}`, tanvir.displayName, 500_000, 8);
  must(await setLoanInstallment(propertyId, l1.id, { installmentPaisa: 300_000, reason: "Reduced until March at owner's request" }, actor), "Change instalment on L1");
  log(`L${l1.number} instalment changed`, tanvir.displayName, 300_000, "Reduced until March at owner's request");

  // L2 · Farzana — manual loan, repaid in two cash payments → REPAID.
  const l2 = await loan(2, farzana, 2_000_000, 3, "Laptop for work");
  await cash(l2.id, `L${l2.number}`, farzana.displayName, 1_000_000, 6);
  await cash(l2.id, `L${l2.number}`, farzana.displayName, 1_000_000, 9);

  // L3 · Nasrin — recorded by mistake, cancelled (no repayments) → CANCELLED, fund restored.
  const l3 = await loan(3, nasrin, 800_000, 4, "Roof water-tank share");
  must(await cancelLoan(propertyId, l3.id, "Recorded for the wrong owner — the tank was paid as a house expense", actor), "Cancel L3");
  log(`L${l3.number} cancelled`, nasrin.displayName, 800_000, "CANCELLED · disbursement reversed");

  // L4 · the Super Admin's own owner row — Self loan with an instalment.
  if (self) await loan(4, self, 1_500_000, 5, "Motorbike repair", 300_000);

  // L5 · Tanvir again — second loan while L1 is active → flagged. A repayment
  // first posted on L1 by mistake is voided there and recorded here (PRD §6.6).
  const l5 = await loan(5, tanvir, 1_000_000, 7, "Medical bills");
  const wrong = await cash(l1.id, `L${l1.number}`, tanvir.displayName, 200_000, 8);
  must(await voidRepayment(propertyId, l1.id, wrong.movement.id, `Recorded on the wrong loan — it belongs to L${l5.number}`, actor), "Void wrong repayment");
  log(`L${l1.number} repayment voided`, tanvir.displayName, 200_000, `reversal posted; moved to L${l5.number}`);
  await cash(l5.id, `L${l5.number}`, tanvir.displayName, 200_000, 8);

  // Advances: one within the limit, one over it (flagged), one voided.
  const advance = async (o: { id: string; displayName: string }, paisa: number, d: number, reason: string, n: number) => {
    const r = must(await createAdvance(propertyId, { ownerId: o.id, amountPaisa: paisa, date: day(d), fundAccountId: payFund.id, ...out, referenceNo: ref(n), reason }, actor), `Advance for ${o.displayName}`);
    log(`Advance — ${reason}`, o.displayName, paisa, [r.entry.flagged && "over limit (flagged)", r.warnings.some((w) => w.code === "OWNER_OWED") && "owner was owed money"].filter(Boolean).join(", ") || "within limit");
    return r.entry;
  };
  await advance(nasrin, 500_000, 6, "Eye check-up", 10);
  await advance(tanvir, 3_000_000, 8, "Cataract surgery for mother", 11);
  const dup = await advance(farzana, 200_000, 9, "Electricity bill share", 12);
  must(await voidLedgerEntry(propertyId, dup.id, "Duplicate entry — already paid in cash", actor), "Void Farzana's advance");
  log("Advance voided", farzana.displayName, 200_000, "Duplicate entry — already paid in cash");

  return { skipped: false, rows };
}

async function main() {
  try {
    const result = await runAdvancesLoansSeed();
    if (result.skipped) {
      console.log("✔ Advances & loans test data already present — nothing changed.");
      return;
    }
    console.log("✔ Advances & loans test data created (open month, real services, audited):");
    console.table(result.rows);
    console.log("Open /en/advances as test.admin (all actions) or test.nasrin / test.tanvir (read-only).");
  } catch (err) {
    console.error(`✖ Advances & loans seed failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-advances-loans.ts")) {
  void main();
}
