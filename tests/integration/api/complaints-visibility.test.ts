// Admin-only complaints are invisible to other owners everywhere (Rule 8, G18,
// §13 "invisible to other owners (list, counts, badges, search)"; design D7).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fileRoute from "@/app/api/v1/attachments/[id]/file/route";
import * as metaRoute from "@/app/api/v1/attachments/[id]/route";
import { prisma } from "@/lib/prisma";
import { apiRequest, params } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { unseenComplaintCount } from "@/lib/complaints/seen";
import { openComplaintCountForMonth } from "@/lib/complaints/questioned";
import { createLoan } from "../../helpers/factory";
import {
  comment,
  complaintDetail,
  complaintsWorld,
  data,
  editComment,
  hideComment,
  listComplaints,
  publish,
  questioned,
  raised,
  reopen,
  seen,
  setStatus,
  withdraw,
} from "../../helpers/notices";

beforeEach(() => freezeDhaka(vi, "2026-10-22T06:00:00Z"));
afterEach(() => vi.useRealTimers());

async function privateWorld() {
  const w = await complaintsWorld();
  const loan = await prisma.loan.findFirstOrThrow({ where: { ownerId: w.owners.tanvir.id } });
  const id = await raised(w.tanvirLogin, { title: "Can the loan instalment be lowered?", visibility: "ADMIN", link: { type: "LOAN", id: loan.id } });
  const file = await prisma.attachment.create({
    data: { propertyId: w.property.id, entityType: "complaint", entityId: id, storageKey: `p/${w.property.id}/att/${crypto.randomUUID()}`, fileName: "letter.pdf", mime: "application/pdf", sizeBytes: 10, uploadedById: w.tanvirUser.id, linkedAt: new Date() },
  });
  const c = await prisma.complaintComment.create({ data: { complaintId: id, authorId: w.tanvirUser.id, body: "Please." } });
  return { ...w, loan, id, file, commentId: c.id };
}

describe("Admin-only complaint seen by another owner", () => {
  it("answers 404 on every endpoint", async () => {
    const w = await privateWorld();
    const f = w.farzanaLogin;
    expect((await complaintDetail(f, w.id)).status).toBe(404);
    expect((await comment(f, w.id, { body: "Me too" })).status).toBe(404);
    expect((await editComment(f, w.id, w.commentId, { body: "x" })).status).toBe(404);
    expect((await withdraw(f, w.id)).status).toBe(404);
    expect((await reopen(f, w.id, "why")).status).toBe(404);
    expect((await publish(f, w.id)).status).toBe(404);
    expect((await seen(f, w.id)).status).toBe(404);
    const meta = await metaRoute.GET(apiRequest(`/attachments/${w.file.id}`, { login: f }), params({ id: w.file.id }));
    expect(meta.status).toBe(404);
    const file = await fileRoute.GET(apiRequest(`/attachments/${w.file.id}/file`, { login: f }), params({ id: w.file.id }));
    expect(file.status).toBe(404);
  });

  it("is absent from lists, counts, questioned markers and badges", async () => {
    const w = await privateWorld();
    expect((await data(await listComplaints(w.farzanaLogin))).items).toEqual([]);
    expect((await data(await questioned(w.farzanaLogin, `type=LOAN&ids=${w.loan.id}`))).items).toEqual({});
    expect(await openComplaintCountForMonth(w.property.id, { userId: w.farzanaUser.id, viewAll: false }, "2026-10")).toBe(0);
    await comment(w.adminLogin, w.id, { body: "Looking." });
    expect(await unseenComplaintCount(w.property.id, { userId: w.farzanaUser.id, viewAll: false })).toBe(0);
  });

  it("is visible to its author and the Super Admin", async () => {
    const w = await privateWorld();
    expect((await complaintDetail(w.tanvirLogin, w.id)).status).toBe(200);
    expect((await complaintDetail(w.adminLogin, w.id)).status).toBe(200);
    expect((await data(await questioned(w.tanvirLogin, `type=LOAN&ids=${w.loan.id}`))).items).toEqual({ [w.loan.id]: w.id });
    expect((await data(await questioned(w.adminLogin, `type=LOAN&ids=${w.loan.id}`))).items).toEqual({ [w.loan.id]: w.id });
    const meta = await metaRoute.GET(apiRequest(`/attachments/${w.file.id}`, { login: w.adminLogin }), params({ id: w.file.id }));
    expect(meta.status).toBe(200);
  });

  it("becomes visible to everyone once its author makes it public", async () => {
    const w = await privateWorld();
    expect((await publish(w.tanvirLogin, w.id)).status).toBe(200);
    expect((await complaintDetail(w.farzanaLogin, w.id)).status).toBe(200);
  });

  it("lets nobody but the Super Admin hide, and nobody but the author withdraw", async () => {
    const w = await privateWorld();
    expect((await hideComment(w.tanvirLogin, w.id, w.commentId, "x")).status).toBe(403);
    expect((await setStatus(w.tanvirLogin, w.id, { status: "IN_REVIEW" })).status).toBe(403);
    const loan2 = await createLoan({ propertyId: w.property.id, ownerId: w.owners.farzana.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100 });
    const pub = await raised(w.farzanaLogin, { link: { type: "LOAN", id: loan2.id } });
    expect((await withdraw(w.tanvirLogin, pub)).status).toBe(403);
  });
});
