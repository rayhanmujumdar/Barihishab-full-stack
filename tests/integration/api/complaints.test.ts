import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createMoneyRequest, createTxn } from "../../helpers/factory";
import { freezeDhaka } from "../../helpers/money";
import {
  comment,
  complaintBody,
  complaintDetail,
  complaintMails,
  complaintsWorld,
  data,
  error,
  linkOne,
  linkOptions,
  listComplaints,
  raise,
  raised,
  setStatus,
  type ComplaintsWorld,
} from "../../helpers/notices";

beforeEach(() => freezeDhaka(vi, "2026-10-22T06:00:00Z"));
afterEach(() => vi.useRealTimers());

const titles = (items: { title: string }[]) => items.map((c) => c.title);

describe("POST /api/v1/complaints (C2)", () => {
  it("raises an Everyone complaint linked to an entry and emails other members without the text", async () => {
    const w = await complaintsWorld();
    await prisma.user.update({ where: { id: w.owner.id }, data: { emailNotices: false } });
    const res = await raise(w.farzanaLogin, complaintBody({ link: { type: "ENTRY", id: w.electricity.id } }));
    expect(res.status).toBe(201);
    const { complaint } = await data(res);
    expect(complaint).toMatchObject({ status: "OPEN", visibility: "ALL", authorName: "Farzana Haque", reopened: false, aboutAdmin: false, mine: true });
    expect(complaint.link).toMatchObject({ type: "ENTRY", id: w.electricity.id, subject: "Electricity", amountPaisa: 710000, month: "2026-10", date: "2026-10-05", hidden: false });
    const row = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
    expect(row.periodId).toBe(w.oct.id);
    const mails = await complaintMails(complaint.id, "NEW");
    expect(new Set(mails.map((m) => m.toUserId))).toEqual(new Set([w.admin.id, w.tanvirUser.id]));
    expect(JSON.stringify(mails[0].payload)).not.toContain("In March");
    expect(await prisma.auditLog.count({ where: { entityId: complaint.id, action: "complaint.raised" } })).toBe(1);
  });

  it("sends an Admin-only complaint to the Super Admin only", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.tanvirLogin, { title: "Can the loan instalment be lowered?", visibility: "ADMIN" });
    const mails = await complaintMails(id);
    expect(mails.map((m) => [m.toUserId, (m.payload as { event: string }).event])).toEqual([[w.admin.id, "NEW_PRIVATE"]]);
  });

  it("stores the linked month for each link type", async () => {
    const w = await complaintsWorld();
    const pay = await createLedgerEntry({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, periodId: w.oct.id, createdById: w.admin.id, type: "PAYOUT", amountPaisa: -300000, fundAccountId: w.cash.id });
    const loan = await prisma.loan.findFirstOrThrow({ where: { ownerId: w.owners.tanvir.id } });
    const req = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.farzana.id, createdById: w.farzanaUser.id });
    const cases: [string, string, string | null][] = [
      ["ENTRY", w.electricity.id, w.oct.id],
      ["MONTH", w.sep.id, w.sep.id],
      ["LEDGER", pay.id, w.oct.id],
      ["LOAN", loan.id, null],
      ["REQUEST", req.id, null],
      ["SHARE_SET", w.sets.jun.id, null],
    ];
    for (const [type, id, periodId] of cases) {
      const cid = await raised(w.farzanaLogin, { link: { type, id } });
      expect((await prisma.complaint.findUniqueOrThrow({ where: { id: cid } })).periodId, type).toBe(periodId);
    }
  });

  it("refuses an unknown, foreign or invisible link", async () => {
    const w = await complaintsWorld();
    const field = async (link: unknown) => (await error(await raise(w.farzanaLogin, complaintBody({ link })))).details.fields.link;
    expect(await field({ type: "ENTRY", id: crypto.randomUUID() })).toBeTruthy();
    expect(await field({ type: "LOAN", id: w.electricity.id })).toBeTruthy();
    const nasrinPending = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id });
    expect(await field({ type: "REQUEST", id: nasrinPending.id })).toBeTruthy();
    expect(await prisma.complaint.count()).toBe(0);
  });

  it("validates with the PRD messages", async () => {
    const w = await complaintsWorld();
    const fields = async (over: Record<string, unknown>) => (await error(await raise(w.farzanaLogin, complaintBody(over)))).details.fields;
    expect(await fields({ title: "" })).toMatchObject({ title: "Add a title." });
    expect(await fields({ body: "too high" })).toMatchObject({ body: "Tell us what's wrong in a few words (at least 10 characters)." });
    expect(await fields({ body: "x".repeat(2001) })).toHaveProperty("body");
    expect(await fields({ title: "x".repeat(121) })).toHaveProperty("title");
    expect(await fields({ attachmentIds: Array.from({ length: 6 }, () => crypto.randomUUID()) })).toHaveProperty("attachmentIds");
  });

  it("flags complaints about the Admin's own money (G14), not plain house expenses", async () => {
    const w = await complaintsWorld();
    const loan = await createLoan({ propertyId: w.property.id, ownerId: w.owners.rayhan.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100000 });
    const adv = await createLedgerEntry({ propertyId: w.property.id, ownerId: w.owners.rayhan.id, periodId: w.oct.id, createdById: w.admin.id, type: "ADVANCE", amountPaisa: -100000, fundAccountId: w.cash.id });
    const req = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.rayhan.id, createdById: w.admin.id, status: "DISBURSED" });
    const grant = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.OWNER_GRANT.id, fundAccountId: w.cash.id, createdById: w.admin.id });
    await prisma.houseTransaction.update({ where: { id: grant.id }, data: { beneficiaryOwnerId: w.owners.rayhan.id } });
    for (const [type, id] of [["LOAN", loan.id], ["LEDGER", adv.id], ["REQUEST", req.id], ["ENTRY", grant.id]] as const) {
      const cid = await raised(w.farzanaLogin, { link: { type, id } });
      expect((await prisma.complaint.findUniqueOrThrow({ where: { id: cid } })).aboutAdmin, type).toBe(true);
    }
    const plain = await raised(w.farzanaLogin, { link: { type: "ENTRY", id: w.electricity.id } });
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id: plain } })).aboutAdmin).toBe(false);
  });
});

/** §12.3: Shop G1 (Open, 15 Oct), electricity (In review, 4 Oct, 2 comments), loan (Resolved, Admin only, 2 Sep). */
async function sample(w: ComplaintsWorld) {
  const at = (iso: string) => vi.setSystemTime(new Date(iso));
  at("2026-09-02T06:00:00Z");
  const loan = await raised(w.tanvirLogin, { title: "Can the loan instalment be lowered?", visibility: "ADMIN" });
  await setStatus(w.adminLogin, loan, { status: "RESOLVED", explanation: "Kept at ৳5,000 so the loan clears by April 2027." });
  at("2026-10-04T06:00:00Z");
  const electricity = await raised(w.farzanaLogin, { link: { type: "ENTRY", id: w.electricity.id } });
  await comment(w.adminLogin, electricity, { body: "Caretaker room AC ran most of September, plus the new stair lights." });
  at("2026-10-04T06:05:00Z");
  await setStatus(w.adminLogin, electricity, { status: "IN_REVIEW" });
  at("2026-10-05T06:00:00Z");
  await comment(w.tanvirLogin, electricity, { body: "Confirmed — the AC was on during the heat wave." });
  at("2026-10-15T06:00:00Z");
  const shop = await raised(w.ownerLogin, { title: "Shop G1 receipt missing for July", link: { type: "MONTH", id: w.sep.id } });
  at("2026-10-22T06:00:00Z");
  return { loan, electricity, shop };
}

describe("GET /api/v1/complaints (C1, §12.3)", () => {
  it("orders Open, In review, then closed for the Super Admin", async () => {
    const w = await complaintsWorld();
    await sample(w);
    const d = await data(await listComplaints(w.adminLogin));
    expect(titles(d.items)).toEqual(["Shop G1 receipt missing for July", "September electricity bill looks high", "Can the loan instalment be lowered?"]);
    expect(d.items[1]).toMatchObject({ status: "IN_REVIEW", commentCount: 2, authorName: "Farzana Haque" });
    expect(d.items[2]).toMatchObject({ status: "RESOLVED", visibility: "ADMIN" });
  });

  it("pages in that order with `more` set when items are left", async () => {
    const w = await complaintsWorld();
    await sample(w);
    const first = await data(await listComplaints(w.adminLogin, "limit=2"));
    expect(titles(first.items)).toEqual(["Shop G1 receipt missing for July", "September electricity bill looks high"]);
    expect(first.more).toBe(true);
    const one = await data(await listComplaints(w.adminLogin, "limit=1&filter=closed"));
    expect(titles(one.items)).toEqual(["Can the loan instalment be lowered?"]);
    expect(one.more).toBe(false);
  });

  it("filters open, in_review, closed, mine and month", async () => {
    const w = await complaintsWorld();
    await sample(w);
    const t = async (query: string) => titles((await data(await listComplaints(w.adminLogin, query))).items);
    expect(await t("filter=open")).toEqual(["Shop G1 receipt missing for July"]);
    expect(await t("filter=in_review")).toEqual(["September electricity bill looks high"]);
    expect(await t("filter=closed")).toEqual(["Can the loan instalment be lowered?"]);
    expect(await t("month=2026-09")).toEqual(["Shop G1 receipt missing for July"]);
    expect(titles((await data(await listComplaints(w.ownerLogin, "filter=mine"))).items)).toEqual(["Shop G1 receipt missing for July"]);
    const paged = await data(await listComplaints(w.adminLogin, "limit=1"));
    expect(paged.items).toHaveLength(1);
    expect(paged.more).toBe(true);
  });

  it("excludes hidden comments from the count", async () => {
    const w = await complaintsWorld();
    const { electricity } = await sample(w);
    const c = await prisma.complaintComment.findFirstOrThrow({ where: { complaintId: electricity, authorId: w.tanvirUser.id } });
    await prisma.complaintComment.update({ where: { id: c.id }, data: { hiddenAt: new Date(), hiddenById: w.admin.id, hiddenReason: "Off topic" } });
    const d = await data(await listComplaints(w.adminLogin, "filter=in_review"));
    expect(d.items[0].commentCount).toBe(1);
  });
});

describe("GET /api/v1/complaints/{id} (C3)", () => {
  it("merges comments and status lines oldest first, tagging Admin comments", async () => {
    const w = await complaintsWorld();
    const { electricity } = await sample(w);
    const d = await data(await complaintDetail(w.farzanaLogin, electricity));
    expect(d.complaint.body).toBe("In March it was ৳4,600. Was the reading checked?");
    expect(d.complaint.thread.map((i: { kind: string; authorName?: string; status?: string; isAdmin?: boolean }) => [i.kind, i.authorName ?? i.status, i.isAdmin ?? null])).toEqual([
      ["comment", "Rayhan Ahmed", true],
      ["status", "IN_REVIEW", null],
      ["comment", "Tanvir Ahmed", false],
    ]);
    expect(d.complaint.actions).toMatchObject({ comment: true, withdraw: true, reopen: false, publish: false, decide: false });
  });

  it("shows the resolution block and only the type of a link the viewer can't open", async () => {
    const w = await complaintsWorld();
    const req = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.farzana.id, createdById: w.farzanaUser.id });
    const id = await raised(w.farzanaLogin, { link: { type: "REQUEST", id: req.id } });
    const tanvir = await data(await complaintDetail(w.tanvirLogin, id));
    expect(tanvir.complaint.link).toMatchObject({ type: "REQUEST", hidden: true, subject: null, amountPaisa: null });
    await setStatus(w.adminLogin, id, { status: "REJECTED", explanation: "Requests are decided on the Requests page." });
    const d = await data(await complaintDetail(w.farzanaLogin, id));
    expect(d.complaint.resolution).toMatchObject({ note: "Requests are decided on the Requests page.", byName: "Rayhan Ahmed" });
    expect(d.complaint.link.hidden).toBe(false);
  });
});

describe("link options (G9)", () => {
  it("searches entries and pre-fills the title in the requested language", async () => {
    const w = await complaintsWorld();
    const d = await data(await linkOptions(w.farzanaLogin, "type=ENTRY&q=electric"));
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ id: w.electricity.id, subject: "Electricity", amountPaisa: 710000, prefill: "Question about Electricity · October 2026" });
    const bn = await data(await linkOne(w.farzanaLogin, "ENTRY", w.electricity.id, "locale=bn"));
    expect(bn.item.prefill).toBe("বিদ্যুৎ · অক্টোবর ২০২৬ নিয়ে প্রশ্ন");
  });

  it("finds an older entry by search even when hundreds of newer entries exist", async () => {
    const w = await complaintsWorld();
    const old = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.ELEC.id, fundAccountId: w.cash.id, createdById: w.admin.id, vendor: "Rahim Plumbing", txnDate: "2026-10-01" });
    await prisma.houseTransaction.createMany({
      data: Array.from({ length: 320 }, () => ({
        propertyId: w.property.id,
        periodId: w.oct.id,
        kind: "EXPENSE" as const,
        categoryId: w.categories.ELEC.id,
        fundAccountId: w.cash.id,
        createdById: w.admin.id,
        amountPaisa: BigInt(100000),
        txnDate: new Date("2026-10-15T00:00:00Z"),
      })),
    });
    const d = await data(await linkOptions(w.farzanaLogin, "type=ENTRY&q=rahim"));
    expect(d.items.map((i: { id: string }) => i.id)).toEqual([old.id]);
  });

  it("offers months, payments, loans, share changes and only visible requests", async () => {
    const w = await complaintsWorld();
    await createLedgerEntry({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, periodId: w.oct.id, createdById: w.admin.id, type: "PAYOUT", amountPaisa: -300000, fundAccountId: w.cash.id });
    const nasrinPending = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id });
    const mine = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.farzana.id, createdById: w.farzanaUser.id });
    const ids = async (type: string) => (await data(await linkOptions(w.farzanaLogin, `type=${type}`))).items.map((i: { id: string }) => i.id);
    expect(await ids("MONTH")).toEqual([w.oct.id, w.sep.id]);
    expect((await ids("LEDGER")).length).toBe(2);
    expect((await ids("LOAN")).length).toBe(1);
    expect(await ids("SHARE_SET")).toEqual([w.sets.jun.id, w.sets.jan.id]);
    const reqs = await ids("REQUEST");
    expect(reqs).toContain(mine.id);
    expect(reqs).not.toContain(nasrinPending.id);
    expect((await linkOne(w.farzanaLogin, "REQUEST", nasrinPending.id)).status).toBe(404);
  });

  it("emails everyone on a new complaint except owners who opted out", async () => {
    const w = await complaintsWorld();
    await prisma.user.update({ where: { id: w.tanvirUser.id }, data: { emailNotices: false } });
    const id = await raised(w.farzanaLogin);
    expect((await complaintMails(id, "NEW")).map((m) => m.toUserId).sort()).toEqual([w.admin.id, w.owner.id].sort());
  });
});
