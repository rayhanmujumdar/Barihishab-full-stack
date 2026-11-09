import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as presign from "@/app/api/v1/attachments/presign/route";
import * as view from "@/app/api/v1/attachments/[id]/route";
import * as payouts from "@/app/api/v1/payouts/route";
import { prisma } from "@/lib/prisma";
import { createFund, setPeriodStatus } from "../../helpers/factory";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

let store: ReturnType<typeof useFakeStorage>;
beforeEach(() => {
  freezeDhaka(vi);
  store = useFakeStorage();
});
afterEach(() => {
  vi.useRealTimers();
  store.reset();
});

type World = Awaited<ReturnType<typeof ownersWorld>>;
const pay = (login: Login, body: unknown, key?: string) => payouts.POST(moneyPost("/payouts", login, body, key), params({}));

async function world() {
  const w = await ownersWorld();
  const house = await createFund(w.property.id, { name: "House cash", openingPaisa: 5000000 });
  return { ...w, house };
}

const body = (w: World & { house: { id: string } }, extra: Record<string, unknown> = {}) => ({
  ownerId: w.owners.farzana.id,
  amountPaisa: 870390,
  date: "2026-10-20",
  fundAccountId: w.house.id,
  method: "BKASH",
  referenceNo: "8FJ2K1",
  ...extra,
});

const balance = async (ownerId: string) => Number((await prisma.ownerLedgerEntry.aggregate({ where: { ownerId }, _sum: { amountPaisa: true } }))._sum.amountPaisa ?? 0);

describe("POST /api/v1/payouts (F11, PAY-01..04)", () => {
  it("pays the full balance and settles the owner in the latest open month", async () => {
    const w = await world();
    const res = await pay(w.adminLogin, body(w));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.entries).toEqual([expect.objectContaining({ type: "PAYOUT", amountPaisa: -870390, month: "2026-10", method: "BKASH", referenceNo: "8FJ2K1", recordedBy: "Rayhan Ahmed" })]);
    expect(data).toMatchObject({ balancePaisa: 0, loan: null, warnings: [] });
    expect(await prisma.auditLog.count({ where: { action: "ledger.payout_created", entityId: data.entries[0].id } })).toBe(1);
  });

  it("returns EXCEEDS_BALANCE with the split proposal and writes nothing", async () => {
    const w = await world();
    const res = await pay(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 1300000 }));
    expect(res.status).toBe(409);
    const { error } = await json(res);
    expect(error.code).toBe("EXCEEDS_BALANCE");
    expect(error.details).toEqual({ balancePaisa: 805585, payoutPaisa: 805585, excessPaisa: 494415 });
    expect(await balance(w.owners.tanvir.id)).toBe(805585);
  });

  it("splits the excess as an advance", async () => {
    const w = await world();
    const res = await pay(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 1300000, splitExcessAs: "ADVANCE" }));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.entries.map((e: { type: string; amountPaisa: number }) => [e.type, e.amountPaisa])).toEqual([
      ["PAYOUT", -805585],
      ["ADVANCE", -494415],
    ]);
    expect(data.entries[1].note).toBe("Paid beyond balance");
    expect(data.balancePaisa).toBe(-494415);
    expect(await prisma.auditLog.count({ where: { action: "ledger.advance_created", entityId: data.entries[1].id } })).toBe(1);
  });

  it("splits the excess as a loan that leaves the balance alone", async () => {
    const w = await world();
    const res = await pay(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 1300000, splitExcessAs: "LOAN", excessReason: "School fees" }));
    const { data } = await json(res);
    expect(data.entries.map((e: { type: string }) => e.type)).toEqual(["PAYOUT"]);
    expect(data.loan).toMatchObject({ principalPaisa: 494415, status: "ACTIVE", reason: "School fees" });
    expect(data.balancePaisa).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "loan.created", entityId: data.loan.id } })).toBe(1);
  });

  it("saves a monthly instalment on a split loan and refuses one above the loan (Distribution F11)", async () => {
    const w = await world();
    const tooBig = await pay(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 1300000, splitExcessAs: "LOAN", loanInstallmentPaisa: 494416 }));
    expect(tooBig.status).toBe(422);
    expect((await json(tooBig)).error.details.fields.loanInstallmentPaisa).toBeTruthy();
    expect(await prisma.loan.count({ where: { ownerId: w.owners.tanvir.id } })).toBe(1);
    const res = await pay(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 1300000, splitExcessAs: "LOAN", loanInstallmentPaisa: 100000 }));
    expect(res.status).toBe(201);
    expect((await json(res)).data.loan).toMatchObject({ principalPaisa: 494415, installmentPaisa: 100000, outstandingPaisa: 494415 });
  });

  it("records only the advance or loan when nothing is owed", async () => {
    const w = await world();
    const none = await pay(w.adminLogin, body(w, { ownerId: w.owners.nasrin.id, amountPaisa: 100000 }));
    expect((await json(none)).error.details).toEqual({ balancePaisa: -500000, payoutPaisa: 0, excessPaisa: 100000 });
    const adv = await json(await pay(w.adminLogin, body(w, { ownerId: w.owners.nasrin.id, amountPaisa: 100000, splitExcessAs: "ADVANCE" })));
    expect(adv.data.entries.map((e: { type: string }) => e.type)).toEqual(["ADVANCE"]);
    expect(adv.data.entries[0].isSelf).toBe(false);
    const loan = await json(await pay(w.adminLogin, body(w, { ownerId: w.owners.nasrin.id, amountPaisa: 100000, splitExcessAs: "LOAN" })));
    expect(loan.data.entries).toEqual([]);
    expect(loan.data.loan.principalPaisa).toBe(100000);
  });

  it("needs a reference number except for cash, an active fund and a sane date", async () => {
    const w = await world();
    const noRef = await pay(w.adminLogin, body(w, { referenceNo: undefined }));
    expect(noRef.status).toBe(422);
    expect((await json(noRef)).error.details.fields.referenceNo).toBe("Add the bKash TrxID, Nagad TrxID or cheque number.");
    expect((await pay(w.adminLogin, body(w, { referenceNo: undefined, method: "CASH" }))).status).toBe(201);
    const off = await createFund(w.property.id, { isActive: false });
    expect((await pay(w.adminLogin, body(w, { fundAccountId: off.id }))).status).toBe(422);
    expect((await pay(w.adminLogin, body(w, { date: "2026-10-23" }))).status).toBe(422);
    expect((await pay(w.adminLogin, body(w, { ownerId: "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b" }))).status).toBe(422);
  });

  it("refuses when no month is open", async () => {
    const w = await world();
    await setPeriodStatus(w.oct.id, "CLOSED");
    const res = await pay(w.adminLogin, body(w));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("NO_OPEN_PERIOD");
    expect(await balance(w.owners.farzana.id)).toBe(870390);
  });

  it("warns (never blocks) when the fund or the House Fund falls short", async () => {
    const w = await world();
    const small = await createFund(w.property.id, { name: "Small", openingPaisa: 500000 });
    const res = await pay(w.adminLogin, body(w, { fundAccountId: small.id }));
    expect(res.status).toBe(201);
    const { warnings } = (await json(res)).data;
    expect(warnings).toContainEqual({ code: "FUND_SHORT", fundAccountId: small.id, balancePaisa: -370390 });
    expect(warnings.find((x: { code: string }) => x.code === "HOUSE_FUND_SHORT")).toBeUndefined();

    const all = await pay(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 6000000, splitExcessAs: "ADVANCE" }));
    // House Fund before: Cash −4000000 (sample advance + loan) + House 5000000 + Small −370390.
    expect((await json(all)).data.warnings).toContainEqual({ code: "HOUSE_FUND_SHORT", balancePaisa: 629610 });
  });

  it("links a receipt that owners can open, and refuses a disguised file", async () => {
    const w = await world();
    const up = async (kind: "png" | "exe") => {
      const res = await presign.POST(apiRequest("/attachments/presign", { login: w.adminLogin, body: { fileName: `r.${kind}`, mime: kind === "png" ? "image/png" : "image/jpeg", size: 64 } }), params({}));
      const id = (await json(res)).data.attachmentId as string;
      const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
      store.put(row.storageKey, fileBytes(kind));
      return id;
    };
    const bad = await pay(w.adminLogin, body(w, { attachmentIds: [await up("exe")] }));
    expect(bad.status).toBe(422);
    expect(await balance(w.owners.farzana.id)).toBe(870390);

    const good = await json(await pay(w.adminLogin, body(w, { attachmentIds: [await up("png")] })));
    const att = good.data.entries[0].attachments[0];
    expect(att).toMatchObject({ fileName: "r.png", mime: "image/png" });
    expect(await prisma.attachment.findUniqueOrThrow({ where: { id: att.id } })).toMatchObject({ entityType: "owner_ledger_entry", entityId: good.data.entries[0].id });
    expect((await view.GET(apiRequest(`/attachments/${att.id}`, { login: w.ownerLogin }), params({ id: att.id }))).status).toBe(200);
  });

  it("replays a double click and lets one of two racing full payouts win", async () => {
    const w = await world();
    const key = randomUUID();
    const a = await json(await pay(w.adminLogin, body(w), key));
    const b = await json(await pay(w.adminLogin, body(w), key));
    expect(b).toEqual(a);
    expect(await prisma.ownerLedgerEntry.count({ where: { ownerId: w.owners.farzana.id, type: "PAYOUT" } })).toBe(1);

    const t = { ownerId: w.owners.tanvir.id, amountPaisa: 805585 };
    const race = await Promise.all([pay(w.adminLogin, body(w, t)), pay(w.adminLogin, body(w, t))]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await balance(w.owners.tanvir.id)).toBe(0);
  });

  it("is admin-only", async () => {
    const w = await world();
    expect((await pay(w.ownerLogin, body(w))).status).toBe(403);
  });
});
