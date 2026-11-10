// Local-only Requests fixtures for manual browser testing, on top of the
// people `pnpm db:seed:test-users` creates (test.tanvir, test.farzana,
// test.nasrin, test.admin) and the Super Admin's own owner row (Self request).
// Run with `pnpm db:seed:requests` (add `-- --keep-emails` to leave the
// request emails in the outbox for the email worker).
//
// Every row goes through the real services (submitRequest, editRequest,
// cancelRequest, approveRequest, rejectRequest, withdrawRequest,
// disburseRequest), so request numbers, linked advances/loans/grant expenses,
// fund moves, audit timelines and badges are exactly what the app would
// produce. Disbursements post in the latest OPEN month, never after today.
// The only direct writes are two backdates so the Home reminders show up
// (pending > 3 days, approved past its needed-by date) — the services always
// stamp "now". Runs once: if the fixtures exist it does nothing. Same
// local-database guard as the test-user seed.
import "dotenv/config";
import type { Result } from "../lib/api/result";
import { formatRequestNumber } from "../lib/accounting/requests";
import { todayIsoInDhaka } from "../lib/clock";
import { balanceOf } from "../lib/master-data/fund-service";
import { monthKey } from "../lib/periods/month";
import { prisma } from "../lib/prisma";
import type { RequestDto, RequestType } from "../lib/requests/dto";
import {
  approveRequest,
  cancelRequest,
  disburseRequest,
  editRequest,
  rejectRequest,
  submitRequest,
  withdrawRequest,
  type RequestActor,
} from "../lib/requests/request-service";
import { assertLocalTarget, type Env } from "./seed-test-users";

/** The first request's reason doubles as the "already seeded" marker. */
export const MARKER_REASON = "Mother's eye operation at Ispahani hospital";

export type RequestsSeedResult = { skipped: boolean; rows: { number: string; type: string; owner: string; amount: string; status: string; note: string }[] };

const taka = (paisa: number) => `৳${(paisa / 100).toLocaleString("en-IN")}`;
const DAY = 86_400_000;

function must<T>(r: Result<T>, what: string): T {
  if (!r.ok) throw new Error(`${what} failed: ${r.code}${r.fields ? ` ${JSON.stringify(r.fields)}` : ""}${r.message ? ` — ${r.message}` : ""}`);
  return r as T;
}

/** ISO date `n` days after `iso` (negative = before). */
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export async function runRequestsSeed(env: Env = process.env, opts: { keepEmails?: boolean } = {}): Promise<RequestsSeedResult> {
  assertLocalTarget(env);
  const property = await prisma.property.findFirst({ orderBy: { createdAt: "asc" } });
  if (!property) throw new Error("No property yet — run `pnpm db:seed` first.");
  const propertyId = property.id;
  if (await prisma.moneyRequest.findFirst({ where: { propertyId, reason: MARKER_REASON } })) return { skipped: true, rows: [] };

  const open = await prisma.period.findFirst({ where: { propertyId, status: "OPEN" }, orderBy: { month: "desc" } });
  if (!open) throw new Error("No open month — open one in Distribution first; disbursements post in an open month.");
  const month = monthKey(open.month);
  const today = todayIsoInDhaka();
  /** Day `d` of the open month, never after today (disburse refuses future dates). */
  const day = (d: number) => {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    return iso < today ? iso : today;
  };
  const due = (n: number) => addDays(today, n);

  // People: each test owner acts as themselves; a Super Admin decides and pays.
  const ownerActor = async (username: string) => {
    const o = await prisma.owner.findFirst({ where: { propertyId, user: { username, status: "ACTIVE" } }, select: { id: true, displayName: true, userId: true } });
    if (!o?.userId) throw new Error(`No active owner linked to "${username}" — run \`pnpm db:seed:test-users\` first.`);
    const actor: RequestActor = { id: o.userId, ip: null, userAgent: "seed:requests", viewAll: false, decide: false, record: false };
    return { ...o, actor };
  };
  const [tanvir, farzana, nasrin] = [await ownerActor("test.tanvir"), await ownerActor("test.farzana"), await ownerActor("test.nasrin")];

  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, owners: { where: { propertyId }, select: { id: true, displayName: true } } },
  });
  if (!admins.length) throw new Error("No active Super Admin — run `pnpm db:seed` first.");
  const adminActor = (id: string): RequestActor => ({ id, ip: null, userAgent: "seed:requests", viewAll: true, decide: true, record: true });
  // test.admin decides when present, so the owner-admin still sees requests "from others".
  const decider = adminActor((admins.find((a) => a.username === "test.admin") ?? admins[0]).id);
  const selfAdmin = admins.find((a) => a.owners.length) ?? null;

  // Funds: pay out from the richest active account, like the loans seed.
  const funds = await prisma.fundAccount.findMany({ where: { propertyId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!funds.length) throw new Error("No active fund account — add one in Settings first.");
  const balances = new Map<string, number>();
  for (const f of funds) balances.set(f.id, await balanceOf(prisma, propertyId, f.id, Number(f.openingBalancePaisa)));
  const payFund = [...funds].sort((a, b) => balances.get(b.id)! - balances.get(a.id)!)[0];
  const method = payFund.type === "CASH" ? ("CASH" as const) : ("BANK" as const);
  const ref = (n: number) => (method === "CASH" ? null : `SEED-REQ-${7700 + n}`);

  const rows: RequestsSeedResult["rows"] = [];
  const ids: string[] = [];
  const log = (r: RequestDto, owner: string, note: string) => {
    rows.push({ number: r.number, type: r.type, owner, amount: taka(r.amountApprovedPaisa ?? r.amountRequestedPaisa), status: r.status, note });
  };

  type Who = { id: string; displayName: string; actor: RequestActor };
  const submit = async (who: Who, type: RequestType, amountPaisa: number, reason: string, neededBy: string, repaymentPlan: string | null = null, onBehalfBy?: RequestActor) => {
    const r = must(
      await submitRequest(propertyId, { type, amountPaisa, reason, neededBy, repaymentPlan, ...(onBehalfBy ? { ownerId: who.id } : {}) }, onBehalfBy ?? who.actor),
      `${type} request for ${who.displayName}`,
    );
    ids.push(r.request.id);
    return r.request;
  };
  const approve = async (id: string, amountPaisa?: number, note?: string, by: RequestActor = decider) => must(await approveRequest(propertyId, id, { amountPaisa, note }, by), "Approve").request;
  const disburse = async (id: string, d: number, n: number, installmentPaisa: number | null = null) =>
    must(await disburseRequest(propertyId, id, { date: day(d), fundAccountId: payFund.id, method, referenceNo: ref(n), installmentPaisa }, decider), "Disburse");

  // ── PENDING ──
  // 1 · Tanvir · advance, waiting on a decision.
  const r1 = await submit(tanvir, "ADVANCE", 1_500_000, MARKER_REASON, due(5));
  log(r1, tanvir.displayName, "pending — decide it as test.admin");

  // 2 · Nasrin · loan with a repayment plan, edited after submitting (timeline shows the edit).
  const r2a = await submit(nasrin, "LOAN", 6_000_000, "Shop renovation in Mirpur", due(14), "৳5,000 a month from my share");
  const r2 = must(await editRequest(propertyId, r2a.id, { amountPaisa: 4_500_000, repaymentPlan: "৳5,000 a month from my share, starting January" }, nasrin.actor), "Edit request 2").request;
  log(r2, nasrin.displayName, "pending — edited (৳60,000 → ৳45,000)");

  // 3 · Farzana · special grant, needed tomorrow.
  const r3 = await submit(farzana, "GRANT", 800_000, "Hospital bill after road accident", due(1));
  log(r3, farzana.displayName, "pending — needed tomorrow");

  // 4 · Tanvir · loan recorded on his behalf by the Super Admin (he asked by phone); a second pending → PENDING_EXISTS.
  const r4 = await submit(tanvir, "LOAN", 2_500_000, "Motorcycle down payment (asked by phone)", due(10), "Monthly ৳2,500", decider);
  log(r4, tanvir.displayName, "pending — recorded on behalf by admin");

  // ── APPROVED, awaiting payout ──
  // 5 · Nasrin · advance approved in full.
  const r5a = await submit(nasrin, "ADVANCE", 300_000, "Gas cylinder and stove", due(3));
  const r5 = await approve(r5a.id);
  log(r5, nasrin.displayName, "approved in full — ready to disburse");

  // 6 · Tanvir · loan approved for less, with the required note.
  const r6a = await submit(tanvir, "LOAN", 5_000_000, "Daughter's university admission", due(7), "৳4,000 a month");
  const r6 = await approve(r6a.id, 3_000_000, "Fund can cover ৳30,000 this month; ask again in December for the rest.");
  log(r6, tanvir.displayName, "approved lower (৳50,000 → ৳30,000)");

  // ── REJECTED / CANCELLED / WITHDRAWN ──
  const r7a = await submit(farzana, "ADVANCE", 2_000_000, "New refrigerator", due(20));
  const r7 = must(await rejectRequest(propertyId, r7a.id, "Not an emergency — please plan it from next month's share.", decider), "Reject").request;
  log(r7, farzana.displayName, "rejected with reason");

  const r8a = await submit(nasrin, "GRANT", 400_000, "Nephew's wedding gift", due(9));
  const r8 = must(await cancelRequest(propertyId, r8a.id, nasrin.actor), "Cancel").request;
  log(r8, nasrin.displayName, "cancelled by the owner while pending");

  const r9a = await submit(tanvir, "ADVANCE", 600_000, "Laptop repair", due(4));
  await approve(r9a.id);
  const r9 = must(await withdrawRequest(propertyId, r9a.id, "Warranty covered the repair — no payout needed.", decider), "Withdraw").request;
  log(r9, tanvir.displayName, "approved then withdrawn");

  // ── DISBURSED (each creates its linked entry, tagged "From request") ──
  const r10a = await submit(farzana, "LOAN", 2_000_000, "Sewing machines for home business", due(2), "৳2,000 a month");
  await approve(r10a.id);
  const d10 = await disburse(r10a.id, 6, 10, 200_000);
  log(d10.request, farzana.displayName, "disbursed → loan with ৳2,000 instalment");

  const r11a = await submit(nasrin, "ADVANCE", 250_000, "Medicine for father", due(1));
  await approve(r11a.id);
  const d11 = await disburse(r11a.id, 7, 11);
  log(d11.request, nasrin.displayName, "disbursed → owner advance");

  const r12a = await submit(tanvir, "GRANT", 1_000_000, "Flood damage to village home", due(2));
  await approve(r12a.id, 700_000, "House fund grant capped at ৳7,000 per owner.");
  const d12 = await disburse(r12a.id, 8, 12);
  log(d12.request, tanvir.displayName, "approved lower, disbursed → grant expense");

  // ── SELF request (Super Admin with an owner row) — self-approved, every owner is told ──
  if (selfAdmin) {
    const self = { id: selfAdmin.owners[0].id, displayName: selfAdmin.owners[0].displayName, actor: adminActor(selfAdmin.id) };
    const r13a = await submit(self, "ADVANCE", 500_000, "Child's school fees", due(6));
    const r13 = await approve(r13a.id, undefined, undefined, self.actor);
    log(r13, self.displayName, "Self request, self-approved");
  }

  // ── Reminders: backdate so the Home note has one of each kind ──
  // r1 pending 5 days; r6 approved and now past its needed-by date.
  await prisma.moneyRequest.update({ where: { id: r1.id }, data: { createdAt: new Date(Date.now() - 5 * DAY) } });
  await prisma.moneyRequest.update({ where: { id: r6.id }, data: { neededBy: new Date(`${addDays(today, -1)}T00:00:00Z`) } });
  rows.find((r) => r.number === r1.number)!.note += " · reminder: pending > 3 days";
  rows.find((r) => r.number === r6.number)!.note += " · reminder: past needed-by";

  // Seed emails would go to real inboxes (the owner-admin's) — drop them unless asked to keep.
  if (!opts.keepEmails) {
    const all = await prisma.emailOutbox.findMany({ where: { template: "REQUEST_UPDATE", status: "QUEUED" }, select: { id: true, payload: true } });
    const seeded = new Set(ids);
    const drop = all.filter((e) => seeded.has((e.payload as { requestId?: string }).requestId ?? "")).map((e) => e.id);
    if (drop.length) await prisma.emailOutbox.deleteMany({ where: { id: { in: drop } } });
  }

  return { skipped: false, rows: rows.sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true })) };
}

async function main() {
  try {
    const result = await runRequestsSeed(process.env, { keepEmails: process.argv.includes("--keep-emails") });
    if (result.skipped) {
      console.log("✔ Requests test data already present — nothing changed.");
      return;
    }
    console.log("✔ Requests test data created (real services, audited):");
    console.table(result.rows);
    console.log(`Numbers like ${formatRequestNumber(Number(todayIsoInDhaka().slice(0, 4)), 1)}.`);
    console.log("Open /en/requests as test.admin (decide, disburse, record) or test.tanvir / test.nasrin / test.farzana (own requests).");
  } catch (err) {
    console.error(`✖ Requests seed failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-requests.ts")) {
  void main();
}
