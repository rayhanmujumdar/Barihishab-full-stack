import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as presign from "@/app/api/v1/attachments/presign/route";
import * as file from "@/app/api/v1/attachments/[id]/file/route";
import { prisma } from "@/lib/prisma";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";
import { apiRequest, json, loginAs, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import {
  comment,
  complaintBody,
  complaintDetail,
  complaintMails,
  complaintsWorld,
  data,
  editComment,
  error,
  hideComment,
  listComplaints,
  noticeBody,
  publish,
  publishNotice,
  questioned,
  raise,
  raised,
  reopen,
  seen,
  setStatus,
  withdraw,
} from "../../helpers/notices";

let store: ReturnType<typeof useFakeStorage>;
beforeEach(() => {
  freezeDhaka(vi, "2026-10-22T06:00:00Z");
  store = useFakeStorage();
});
afterEach(() => {
  vi.useRealTimers();
  store.reset();
});

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const mailTo = async (id: string, event: string) => (await complaintMails(id, event)).map((m) => m.toUserId).sort();

async function upload(login: Login, name = "bill.pdf") {
  const res = await presign.POST(apiRequest("/attachments/presign", { login, body: { fileName: name, mime: "application/pdf", size: 64 } }), params({}));
  const id = (await json(res)).data.attachmentId as string;
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
  store.put(row.storageKey, fileBytes("pdf"));
  return id;
}
const getFile = (login: Login, id: string) => file.GET(apiRequest(`/attachments/${id}/file`, { login }), params({ id }));

describe("PATCH /api/v1/complaints/{id}/status (C4)", () => {
  it("sets In review with an optional note and tells only the complainant", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    const res = await setStatus(w.adminLogin, id, { status: "IN_REVIEW", explanation: "Checking the meter photo." });
    expect(res.status).toBe(200);
    const { complaint } = await data(res);
    expect(complaint.status).toBe("IN_REVIEW");
    expect(complaint.thread.at(-1)).toMatchObject({ kind: "status", status: "IN_REVIEW", note: "Checking the meter photo.", actorName: "Rayhan Ahmed" });
    expect(await mailTo(id, "IN_REVIEW")).toEqual([w.farzanaUser.id]);
  });

  it("skips the In review email for a complainant who opted out", async () => {
    const w = await complaintsWorld();
    await prisma.user.update({ where: { id: w.farzanaUser.id }, data: { emailNotices: false } });
    const id = await raised(w.farzanaLogin);
    await setStatus(w.adminLogin, id, { status: "IN_REVIEW" });
    expect(await mailTo(id, "IN_REVIEW")).toEqual([]);
  });

  it("refuses Resolve and Reject without an explanation", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    for (const status of ["RESOLVED", "REJECTED"]) {
      const e = await error(await setStatus(w.adminLogin, id, { status, explanation: "  " }));
      expect(e.details.fields).toMatchObject({ explanation: "Write the explanation first — the complainant receives it." });
    }
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
  });

  it("resolves an Everyone complaint with a fix link and emails the complainant (always) and other members", async () => {
    const w = await complaintsWorld();
    await prisma.user.update({ where: { id: w.farzanaUser.id }, data: { emailNotices: false } });
    await prisma.user.update({ where: { id: w.owner.id }, data: { emailNotices: false } });
    const id = await raised(w.farzanaLogin, { link: { type: "ENTRY", id: w.electricity.id } });
    const { complaint } = await data(await setStatus(w.adminLogin, id, { status: "RESOLVED", explanation: "Caretaker AC during the heat wave.", fix: { type: "ENTRY", id: w.electricity.id } }));
    expect(complaint).toMatchObject({ status: "RESOLVED", resolution: { note: "Caretaker AC during the heat wave.", byName: "Rayhan Ahmed", fix: { type: "ENTRY", id: w.electricity.id } } });
    expect(complaint.closedAt).toBe("2026-10-22T06:00:00.000Z");
    expect(await mailTo(id, "RESOLVED")).toEqual([w.farzanaUser.id, w.tanvirUser.id].sort());
    const mail = (await complaintMails(id, "RESOLVED"))[0];
    expect(mail.payload).toMatchObject({ explanation: "Caretaker AC during the heat wave.", link: true });
    expect((await data(await questioned(w.farzanaLogin, `type=ENTRY&ids=${w.electricity.id}`))).items).toEqual({});
  });

  it("tells only the complainant about a plain Admin-only resolution", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.tanvirLogin, { visibility: "ADMIN" });
    await setStatus(w.adminLogin, id, { status: "REJECTED", explanation: "Kept at ৳5,000." });
    expect(await mailTo(id, "REJECTED")).toEqual([w.tanvirUser.id]);
  });

  it("emails every member, without a link, about a private complaint on the Admin's own loan (Rule 13)", async () => {
    const w = await complaintsWorld();
    const loan = await prisma.loan.create({
      data: { propertyId: w.property.id, number: 7, ownerId: w.owners.rayhan.id, principalPaisa: BigInt(100000), disbursedOn: new Date("2026-10-01T00:00:00Z"), fundAccountId: w.cash.id, method: "CASH", createdById: w.admin.id, reason: "Own loan" },
    });
    const id = await raised(w.tanvirLogin, { visibility: "ADMIN", link: { type: "LOAN", id: loan.id } });
    await setStatus(w.adminLogin, id, { status: "RESOLVED", explanation: "Same terms as everyone." });
    const mails = await complaintMails(id, "RESOLVED");
    expect(mails.map((m) => m.toUserId).sort()).toEqual([w.owner.id, w.tanvirUser.id, w.farzanaUser.id].sort());
    expect(mails.find((m) => m.toUserId === w.tanvirUser.id)!.payload).toMatchObject({ link: true });
    expect(mails.find((m) => m.toUserId === w.owner.id)!.payload).toMatchObject({ link: false });
  });

  it("refuses owners and invalid transitions, and lets only one of two concurrent decisions win", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    expect((await setStatus(w.ownerLogin, id, { status: "IN_REVIEW" })).status).toBe(403);
    const both = await Promise.all([
      setStatus(w.adminLogin, id, { status: "RESOLVED", explanation: "Done." }),
      setStatus(w.adminLogin, id, { status: "REJECTED", explanation: "No." }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await error(await setStatus(w.adminLogin, id, { status: "IN_REVIEW" }))).code).toBe("INVALID_COMPLAINT_STATUS");
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "complaint.status_changed" } })).toBe(1);
  });
});

describe("withdraw, reopen and publish (C5, C6, G15)", () => {
  it("lets the complainant withdraw a live complaint, telling the Super Admin", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin, { link: { type: "ENTRY", id: w.electricity.id } });
    expect((await withdraw(w.tanvirLogin, id)).status).toBe(403);
    const { complaint } = await data(await withdraw(w.farzanaLogin, id));
    expect(complaint.status).toBe("WITHDRAWN");
    expect(await mailTo(id, "WITHDRAWN")).toEqual([w.admin.id]);
    expect((await data(await questioned(w.farzanaLogin, `type=ENTRY&ids=${w.electricity.id}`))).items).toEqual({});
    expect((await error(await withdraw(w.farzanaLogin, id))).code).toBe("INVALID_COMPLAINT_STATUS");
  });

  it("reopens once within 14 days with a comment", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.tanvirLogin, { visibility: "ADMIN" });
    await setStatus(w.adminLogin, id, { status: "RESOLVED", explanation: "Kept at ৳5,000." });
    at("2026-10-25T06:00:00Z");
    const tanvir = await loginAs(w.tanvirUser);
    expect((await error(await reopen(tanvir, id, " "))).details.fields).toMatchObject({ comment: "Say why it isn't resolved." });
    const { complaint } = await data(await reopen(tanvir, id, "Can it be ৳4,000 then?"));
    expect(complaint).toMatchObject({ status: "OPEN", reopened: true, resolution: null });
    expect(complaint.thread.slice(-2).map((i: { kind: string }) => i.kind)).toEqual(["status", "comment"]);
    expect(await mailTo(id, "REOPENED")).toEqual([w.admin.id]);
    await setStatus(await loginAs(w.admin), id, { status: "REJECTED", explanation: "No." });
    expect((await error(await reopen(tanvir, id, "Again"))).code).toBe("INVALID_COMPLAINT_STATUS");
  });

  it("refuses a reopen 15 days after closing, and by anyone but the complainant", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    await setStatus(w.adminLogin, id, { status: "REJECTED", explanation: "Bill matches the meter." });
    expect((await reopen(w.tanvirLogin, id, "Me neither")).status).toBe(403);
    at("2026-11-06T06:00:01Z");
    expect((await error(await reopen(await loginAs(w.farzanaUser), id, "Still high"))).code).toBe("REOPEN_WINDOW_PASSED");
  });

  it("makes an Admin-only complaint public once, by its author, emailing members (not the Super Admin again)", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.tanvirLogin, { visibility: "ADMIN" });
    expect((await publish(w.adminLogin, id)).status).toBe(403);
    const { complaint } = await data(await publish(w.tanvirLogin, id));
    expect(complaint.visibility).toBe("ALL");
    expect(await mailTo(id, "NEW_PRIVATE")).toEqual([w.admin.id]);
    expect(await mailTo(id, "NEW")).toEqual([w.owner.id, w.farzanaUser.id].sort());
    expect((await error(await publish(w.tanvirLogin, id))).code).toBe("INVALID_COMPLAINT_STATUS");
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "complaint.published" } })).toBe(1);
  });
});

describe("comments (C7, G13)", () => {
  it("adds comments on live complaints only, with up to 3 files", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    const f = await upload(w.tanvirLogin);
    const res = await comment(w.tanvirLogin, id, { body: "Confirmed — the AC was on.", attachmentIds: [f] });
    expect(res.status).toBe(201);
    const { complaint } = await data(res);
    expect(complaint.thread[0]).toMatchObject({ kind: "comment", authorName: "Tanvir Ahmed", isAdmin: false, body: "Confirmed — the AC was on." });
    expect(complaint.thread[0].attachments).toHaveLength(1);
    expect((await error(await comment(w.tanvirLogin, id, { body: "x", attachmentIds: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] }))).details.fields).toHaveProperty("attachmentIds");
    await setStatus(w.adminLogin, id, { status: "RESOLVED", explanation: "Done." });
    expect((await error(await comment(w.tanvirLogin, id, { body: "One more" }))).code).toBe("COMPLAINT_CLOSED");
  });

  it("refuses linking someone else's upload", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    const f = await upload(w.ownerLogin);
    expect((await error(await comment(w.tanvirLogin, id, { body: "See this", attachmentIds: [f] }))).details.fields).toHaveProperty("attachmentIds");
  });

  it("lets the author edit within 15 minutes only", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    const { complaint } = await data(await comment(w.tanvirLogin, id, { body: "Typo heer" }));
    const cid = complaint.thread[0].id;
    expect((await editComment(w.farzanaLogin, id, cid, { body: "Mine now" })).status).toBe(403);
    at("2026-10-22T06:14:00Z");
    const edited = await data(await editComment(w.tanvirLogin, id, cid, { body: "Typo here" }));
    expect(edited.complaint.thread[0]).toMatchObject({ body: "Typo here", editedAt: "2026-10-22T06:14:00.000Z" });
    at("2026-10-22T06:16:00Z");
    expect((await error(await editComment(await loginAs(w.tanvirUser), id, cid, { body: "Again" }))).code).toBe("EDIT_WINDOW_PASSED");
  });

  it("lets the Super Admin hide a comment for everyone, keeping the text in the audit log and hiding its files", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    const f = await upload(w.tanvirLogin);
    const { complaint } = await data(await comment(w.tanvirLogin, id, { body: "Personal remark", attachmentIds: [f] }));
    const cid = complaint.thread[0].id;
    expect((await hideComment(w.ownerLogin, id, cid, "x")).status).toBe(403);
    expect((await getFile(w.ownerLogin, f)).status).toBe(200);
    await hideComment(w.adminLogin, id, cid, "Personal remark about family");
    for (const login of [w.adminLogin, w.farzanaLogin]) {
      const d = await data(await complaintDetail(login, id));
      expect(d.complaint.thread[0]).toMatchObject({ body: null, hiddenReason: "Personal remark about family", attachments: [] });
    }
    expect((await getFile(w.ownerLogin, f)).status).toBe(404);
    const a = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "complaint.comment_hidden" } });
    expect(a).toMatchObject({ reason: "Personal remark about family", before: { commentId: cid, body: "Personal remark" } });
  });

  it("marks the complainant unseen after someone else comments until they call seen", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    at("2026-10-22T07:00:00Z");
    await comment(await loginAs(w.admin), id, { body: "Looking into it." });
    const farzana = await loginAs(w.farzanaUser);
    expect((await data(await listComplaints(farzana))).items[0].unseen).toBe(true);
    expect((await data(await listComplaints(await loginAs(w.owner)))).items[0].unseen).toBe(false);
    expect((await seen(farzana, id)).status).toBe(200);
    expect((await data(await listComplaints(farzana))).items[0].unseen).toBe(false);
  });

  it("writes an audit row for every action", async () => {
    const w = await complaintsWorld();
    const id = await raised(w.farzanaLogin);
    const { complaint } = await data(await comment(w.farzanaLogin, id, { body: "More detail" }));
    await editComment(w.farzanaLogin, id, complaint.thread[0].id, { body: "More detail, fixed" });
    await setStatus(w.adminLogin, id, { status: "IN_REVIEW" });
    await withdraw(w.farzanaLogin, id);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { id: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["complaint.raised", "complaint.comment_added", "complaint.comment_edited", "complaint.status_changed", "complaint.withdrawn"]);
  });
});

describe("notice and complaint files (G3, G8, Rule 17)", () => {
  it("attaches files to a notice (members can open them) and to a complaint", async () => {
    const w = await complaintsWorld();
    const nf = await upload(w.adminLogin, "notice.pdf");
    const { notice } = await data(await publishNotice(w.adminLogin, noticeBody({ attachmentIds: [nf] })));
    expect(notice.attachments).toHaveLength(1);
    expect((await getFile(w.ownerLogin, nf)).status).toBe(200);
    const cf = await upload(w.farzanaLogin, "photo.pdf");
    const res = await raise(w.farzanaLogin, complaintBody({ attachmentIds: [cf] }));
    expect((await data(res)).complaint.attachments).toHaveLength(1);
    expect((await getFile(w.tanvirLogin, cf)).status).toBe(200);
  });
});
