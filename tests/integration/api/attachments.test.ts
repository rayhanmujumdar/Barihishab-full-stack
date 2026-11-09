import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as presign from "@/app/api/v1/attachments/presign/route";
import * as view from "@/app/api/v1/attachments/[id]/route";
import * as txnAttach from "@/app/api/v1/transactions/[id]/attachments/route";
import * as txnAttachOne from "@/app/api/v1/transactions/[id]/attachments/[attId]/route";
import * as one from "@/app/api/v1/transactions/[id]/route";
import * as txns from "@/app/api/v1/transactions/route";
import { inTransaction } from "@/lib/api/in-transaction";
import { linkAttachments, sweepUnlinkedUploads, UNLINKED_TTL_MS } from "@/lib/attachments/attachment-service";
import { prisma } from "@/lib/prisma";
import { createProperty, createTxn, moneyWorld } from "../../helpers/factory";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";
import { apiRequest, json, loginAs, params, type Login } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";

let store: ReturnType<typeof useFakeStorage>;
beforeEach(() => {
  freezeDhaka(vi);
  store = useFakeStorage();
});
afterEach(() => {
  vi.useRealTimers();
  store.reset();
});

async function setup() {
  const w = await moneyWorld();
  const entry = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.ELEC.id, fundAccountId: w.bank.id, createdById: w.admin.id });
  return { ...w, entry, adminLogin: await loginAs(w.admin), ownerLogin: await loginAs(w.owner) };
}

async function upload(login: Login, kind: "png" | "pdf" | "exe" = "png", opts: { size?: number; storedSize?: number; mime?: string; skipPut?: boolean } = {}) {
  const size = opts.size ?? 64;
  const mime = opts.mime ?? { png: "image/png", pdf: "application/pdf", exe: "image/jpeg" }[kind];
  const res = await presign.POST(apiRequest("/attachments/presign", { login, body: { fileName: `bill.${kind}`, mime, size } }), params({}));
  const body = await json(res);
  if (res.status !== 201) return { res, body, id: "" };
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id: body.data.attachmentId } });
  if (!opts.skipPut) store.put(row.storageKey, fileBytes(kind, opts.storedSize ?? size));
  return { res, body, id: body.data.attachmentId as string };
}

const link = (w: Awaited<ReturnType<typeof setup>>, ids: string[], login = w.adminLogin, txnId = w.entry.id) =>
  txnAttach.POST(apiRequest(`/transactions/${txnId}/attachments`, { login, body: { attachmentIds: ids } }), params({ id: txnId }));

describe("POST /api/v1/attachments/presign (ATT-01)", () => {
  it("returns a presigned PUT and an unlinked attachment", async () => {
    const w = await setup();
    const { res, body } = await upload(w.adminLogin, "pdf", { size: 240000 });
    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ uploadUrl: expect.stringContaining("https://s3.test/put/p/"), headers: { "Content-Type": "application/pdf" }, expiresAt: expect.any(String) });
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: body.data.attachmentId } });
    expect(row).toMatchObject({ entityId: null, fileName: "bill.pdf", sizeBytes: 240000 });
    expect(row.storageKey).not.toContain("bill");
  });

  it("refuses big files, other types and owners", async () => {
    const w = await setup();
    expect((await upload(w.adminLogin, "png", { size: 6_000_000 })).res.status).toBe(413);
    expect((await upload(w.adminLogin, "png", { mime: "application/x-msdownload" })).res.status).toBe(422);
    expect((await upload(w.ownerLogin)).res.status).toBe(403);
  });
});

describe("linking (ATT-01, ATT-03)", () => {
  it("links on create and counts on the entry", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin);
    const res = await txns.POST(
      moneyPost("/transactions", w.adminLogin, { period: "2026-10", kind: "EXPENSE", categoryId: w.categories.GAS.id, amountPaisa: 108000, txnDate: "2026-10-10", fundAccountId: w.cash.id, attachmentIds: [id] }),
      params({}),
    );
    expect(res.status).toBe(201);
    const { transaction } = (await json(res)).data;
    expect(transaction.attachmentCount).toBe(1);
    expect(await prisma.auditLog.findFirst({ where: { action: "attachment.added", entityId: transaction.id } })).toMatchObject({ after: { fileName: "bill.png" } });
  });

  it("adds after save, and the detail lists it", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin, "pdf");
    const res = await link(w, [id]);
    expect(res.status).toBe(200);
    expect((await json(res)).data.attachments).toHaveLength(1);
    const detail = await json(await one.GET(apiRequest(`/transactions/${w.entry.id}`, { login: w.ownerLogin }), params({ id: w.entry.id })));
    expect(detail.data.attachments[0]).toMatchObject({ id, mime: "application/pdf" });
    expect(detail.data.history.map((h: { action: string }) => h.action)).toContain("attachment.added");
  });

  it("IE-20: refuses a renamed executable by its magic bytes", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin, "exe");
    const res = await link(w, [id]);
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields.attachmentIds).toBe("Only JPG, PNG, WebP or PDF up to 5 MB.");
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).entityId).toBeNull();
  });

  it("refuses missing objects, size mismatches, foreign or already-linked uploads", async () => {
    const w = await setup();
    expect((await link(w, [(await upload(w.adminLogin, "png", { skipPut: true })).id])).status).toBe(422);
    expect((await link(w, [(await upload(w.adminLogin, "png", { storedSize: 99 })).id])).status).toBe(422);

    const linked = (await upload(w.adminLogin)).id;
    expect((await link(w, [linked])).status).toBe(200);
    expect((await link(w, [linked])).status).toBe(422);

    const other = await createProperty();
    const foreign = (await upload(w.adminLogin)).id;
    await prisma.attachment.update({ where: { id: foreign }, data: { propertyId: other.id } });
    expect((await link(w, [foreign])).status).toBe(422);
  });

  it("refuses a sixth file", async () => {
    const w = await setup();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await upload(w.adminLogin)).id);
    expect((await link(w, ids)).status).toBe(200);
    const res = await link(w, [(await upload(w.adminLogin)).id]);
    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe("TOO_MANY_ATTACHMENTS");
  });

  it("refuses changes on Closed months and voided entries, and owners", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin);
    expect((await link(w, [id], w.ownerLogin)).status).toBe(403);
    await prisma.houseTransaction.update({ where: { id: w.entry.id }, data: { voidedAt: new Date(), voidReason: "Duplicate entry" } });
    expect((await json(await link(w, [id]))).error.code).toBe("ALREADY_VOIDED");
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    expect((await json(await link(w, [id]))).error.code).toBe("PERIOD_CLOSED");
  });
});

describe("removal and viewing (ATT-02)", () => {
  it("soft-removes with audit; removed files can't be viewed", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin);
    await link(w, [id]);

    const seen = await view.GET(apiRequest(`/attachments/${id}`, { login: w.ownerLogin }), params({ id }));
    expect(seen.status).toBe(200);
    expect((await json(seen)).data).toMatchObject({ url: expect.stringContaining("https://s3.test/get/"), mime: "image/png", fileName: "bill.png", expiresAt: expect.any(String) });

    const del = await txnAttachOne.DELETE(apiRequest(`/transactions/${w.entry.id}/attachments/${id}`, { method: "DELETE", login: w.adminLogin }), params({ id: w.entry.id, attId: id }));
    expect(del.status).toBe(204);
    expect(await prisma.auditLog.findFirst({ where: { action: "attachment.removed", entityId: w.entry.id } })).toMatchObject({ before: { fileName: "bill.png" } });
    expect((await view.GET(apiRequest(`/attachments/${id}`, { login: w.ownerLogin }), params({ id }))).status).toBe(404);
    const detail = await json(await one.GET(apiRequest(`/transactions/${w.entry.id}`, { login: w.ownerLogin }), params({ id: w.entry.id })));
    expect(detail.data.attachments).toEqual([]);
  });

  it("won't remove in a Closed month and won't show unlinked uploads", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin);
    expect((await view.GET(apiRequest(`/attachments/${id}`, { login: w.ownerLogin }), params({ id }))).status).toBe(404);
    await link(w, [id]);
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    const del = await txnAttachOne.DELETE(apiRequest(`/transactions/${w.entry.id}/attachments/${id}`, { method: "DELETE", login: w.adminLogin }), params({ id: w.entry.id, attId: id }));
    expect((await json(del)).error.code).toBe("PERIOD_CLOSED");
  });
});

describe("link races, sweeping and upload limits", () => {
  it("a file linked elsewhere meanwhile aborts with 422, not a 500", async () => {
    const w = await setup();
    const { id } = await upload(w.adminLogin);
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect((await link(w, [id])).status).toBe(200);
    // Second writer verified the same upload before the first linked it.
    const other = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.ELEC.id, fundAccountId: w.bank.id, createdById: w.admin.id });
    const r = await inTransaction((tx) => linkAttachments(tx, w.property.id, other.id, [row], { id: w.admin.id }));
    expect(r).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { attachmentIds: "Upload the file again." } });
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).entityId).toBe(w.entry.id);
  });

  it("sweeps day-old unlinked uploads (row soft-removed, object deleted) and leaves the rest", async () => {
    const w = await setup();
    const stale = await upload(w.adminLogin);
    const fresh = await upload(w.adminLogin);
    const linked = await upload(w.adminLogin);
    await link(w, [linked.id]);
    const old = new Date(Date.now() - UNLINKED_TTL_MS - 60_000);
    await prisma.attachment.updateMany({ where: { id: { in: [stale.id, linked.id] } }, data: { createdAt: old } });

    expect(await sweepUnlinkedUploads()).toBe(1);
    const rows = Object.fromEntries((await prisma.attachment.findMany()).map((a) => [a.id, a]));
    expect(rows[stale.id].removedAt).not.toBeNull();
    expect(store.has(rows[stale.id].storageKey)).toBe(false);
    expect(rows[fresh.id].removedAt).toBeNull();
    expect(store.has(rows[fresh.id].storageKey)).toBe(true);
    expect(rows[linked.id].removedAt).toBeNull();
    expect(store.has(rows[linked.id].storageKey)).toBe(true);

    // A swept upload can't be linked any more.
    expect((await link(w, [stale.id])).status).toBe(422);
  });

  it("limits presigns to 30 per 10 minutes per user", async () => {
    const w = await setup();
    for (let i = 0; i < 30; i++) expect((await upload(w.adminLogin, "png", { skipPut: true })).res.status).toBe(201);
    const res = (await upload(w.adminLogin, "png", { skipPut: true })).res;
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
