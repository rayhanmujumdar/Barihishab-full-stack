import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../helpers/factory";
import { loginAs } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import {
  archiveNotice,
  createNotice,
  data,
  editNotice,
  error,
  listNotices,
  noticeBody,
  noticeMails,
  noticesWorld,
  publishNotice,
  readAll,
  readNotice,
  remind,
  whoRead,
  type NoticesWorld,
} from "../../helpers/notices";

beforeEach(() => freezeDhaka(vi, "2026-10-22T06:00:00Z"));
afterEach(() => vi.useRealTimers());

/** §12.1: the three sample notices, Rayhan and Tanvir having read two of them. */
async function sample(w: NoticesWorld) {
  const both = [w.admin.id, w.tanvirUser.id];
  const water = await createNotice(w, { title: "Water tank cleaning — Sunday 26 Oct", publishedAt: "2026-10-20T04:00:00Z", priority: "URGENT", pinned: true, pinUntil: "2026-10-26", readBy: both });
  const closed = await createNotice(w, { title: "September accounts are closed", publishedAt: "2026-10-03T04:00:00Z", readBy: [...both, w.owner.id, w.farzanaUser.id] });
  const tax = await createNotice(w, { title: "Holding tax — next instalment due 15 Jan", publishedAt: "2026-10-02T04:00:00Z", pinned: true, readBy: both });
  return { water, closed, tax };
}

describe("GET /api/v1/notices (N1, N4, §12.1)", () => {
  it("lists pinned first then newest, with read counts over active members", async () => {
    const w = await noticesWorld();
    await sample(w);
    const res = await listNotices(w.ownerLogin);
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d.items.map((n: { title: string }) => n.title)).toEqual(["Water tank cleaning — Sunday 26 Oct", "Holding tax — next instalment due 15 Jan", "September accounts are closed"]);
    expect(d.items[0]).toMatchObject({ priority: "URGENT", pinned: true, pinUntil: "2026-10-26", read: false, readCount: 2, memberCount: 4, authorName: "Rayhan Ahmed", editedAt: null });
    expect(d.items[2]).toMatchObject({ read: true, readCount: 4, memberCount: 4 });
    expect(d).toMatchObject({ activeMembers: 4, unread: 2, reachEmail: null });
  });

  it("unpins the water notice the day after Pin until (27 Oct)", async () => {
    const w = await noticesWorld();
    await sample(w);
    vi.setSystemTime(new Date("2026-10-27T06:00:00Z"));
    const d = await data(await listNotices(await loginAs(w.owner)));
    expect(d.items.map((n: { title: string; pinned: boolean }) => [n.title.slice(0, 5), n.pinned])).toEqual([
      ["Holdi", true],
      ["Water", false],
      ["Septe", false],
    ]);
  });

  it("drops deactivated members from both numbers and tells the Super Admin the email reach", async () => {
    const w = await noticesWorld();
    await sample(w);
    await prisma.user.update({ where: { id: w.tanvirUser.id }, data: { status: "INACTIVE" } });
    await prisma.user.update({ where: { id: w.farzanaUser.id }, data: { emailNotices: false } });
    const d = await data(await listNotices(w.adminLogin));
    expect(d.items[0]).toMatchObject({ readCount: 1, memberCount: 3 });
    expect(d.activeMembers).toBe(3);
    expect(d.reachEmail).toBe(2);
  });

  it("moves archived notices to ?archived=1 and pages with limit", async () => {
    const w = await noticesWorld();
    const { closed } = await sample(w);
    await archiveNotice(w.adminLogin, closed.id);
    const live = await data(await listNotices(w.ownerLogin));
    expect(live.items).toHaveLength(2);
    const archived = await data(await listNotices(w.ownerLogin, "?archived=1"));
    expect(archived.items.map((n: { id: string }) => n.id)).toEqual([closed.id]);
    expect(archived.items[0].archivedAt).toBeTruthy();
    const paged = await data(await listNotices(w.ownerLogin, "?limit=1"));
    expect(paged.items).toHaveLength(1);
    expect(paged.more).toBe(true);
  });
});

describe("POST /api/v1/notices (N2)", () => {
  it("publishes, records the author's read, audits and emails every active member", async () => {
    const w = await noticesWorld();
    await prisma.user.update({ where: { id: w.farzanaUser.id }, data: { emailNotices: false } });
    const res = await publishNotice(w.adminLogin, noticeBody());
    expect(res.status).toBe(201);
    const { notice, emailed } = await data(res);
    expect(emailed).toBe(4);
    expect(notice).toMatchObject({ title: "Water tank cleaning — Sunday 26 Oct", priority: "URGENT", pinned: true, read: true, readCount: 1, memberCount: 4 });
    const mails = await noticeMails(notice.id, "PUBLISHED");
    expect(new Set(mails.map((m) => m.toUserId))).toEqual(new Set([w.admin.id, w.owner.id, w.tanvirUser.id, w.farzanaUser.id]));
    expect(mails[0].payload).toMatchObject({ urgent: true, authorName: "Rayhan Ahmed", body: expect.stringContaining("**10 am to 2 pm**") });
    expect(mails.some((m) => m.toUserId === w.invited.id)).toBe(false);
    const audits = await prisma.auditLog.findMany({ where: { entityId: notice.id } });
    expect(audits.map((a) => a.action)).toEqual(["notice.published"]);
  });

  it("honours the email opt-out for a normal notice", async () => {
    const w = await noticesWorld();
    await prisma.user.update({ where: { id: w.farzanaUser.id }, data: { emailNotices: false } });
    const { emailed } = await data(await publishNotice(w.adminLogin, noticeBody({ priority: "NORMAL", pinned: false, pinUntil: null })));
    expect(emailed).toBe(3);
  });

  it("validates with the PRD messages", async () => {
    const w = await noticesWorld();
    const fields = async (body: unknown) => (await error(await publishNotice(w.adminLogin, body))).details.fields;
    expect(await fields(noticeBody({ title: " " }))).toMatchObject({ title: "Add a title." });
    expect(await fields(noticeBody({ body: "" }))).toMatchObject({ body: "Write the message." });
    expect(await fields(noticeBody({ title: "x".repeat(121) }))).toHaveProperty("title");
    expect(await fields(noticeBody({ body: "x".repeat(3001) }))).toHaveProperty("body");
    expect(await fields(noticeBody({ pinUntil: "2026-10-21" }))).toMatchObject({ pinUntil: "Pick today or a later date." });
    expect(await fields(noticeBody({ attachmentIds: Array.from({ length: 6 }, () => crypto.randomUUID()) }))).toHaveProperty("attachmentIds");
    expect(await prisma.notice.count()).toBe(0);
  });

  it("refuses owners every manage endpoint", async () => {
    const w = await noticesWorld();
    const n = await createNotice(w, { title: "Holding tax", publishedAt: "2026-10-02T04:00:00Z", priority: "URGENT" });
    expect((await publishNotice(w.ownerLogin, noticeBody())).status).toBe(403);
    expect((await editNotice(w.ownerLogin, n.id, { title: "x" })).status).toBe(403);
    expect((await archiveNotice(w.ownerLogin, n.id)).status).toBe(403);
    expect((await whoRead(w.ownerLogin, n.id)).status).toBe(403);
    expect((await remind(w.ownerLogin, n.id)).status).toBe(403);
  });
});

describe("PATCH /api/v1/notices/{id} and archive (N3)", () => {
  it("marks content edits Edited, but not pin changes", async () => {
    const w = await noticesWorld();
    const n = await createNotice(w, { title: "Holding tax", publishedAt: "2026-10-02T04:00:00Z", pinned: true });
    const unpinned = await data(await editNotice(w.adminLogin, n.id, { pinned: false }));
    expect(unpinned.notice).toMatchObject({ pinned: false, editedAt: null });
    expect(unpinned.emailed).toBe(0);
    const edited = await data(await editNotice(w.adminLogin, n.id, { body: "Around ৳18,500 this time." }));
    expect(edited.notice.editedAt).toBe("2026-10-22T06:00:00.000Z");
    expect(await noticeMails(n.id)).toHaveLength(0);
    const audits = await prisma.auditLog.findMany({ where: { entityId: n.id }, orderBy: { id: "asc" } });
    expect(audits.map((a) => a.action)).toEqual(["notice.unpinned", "notice.edited"]);
  });

  it("emails the change when asked", async () => {
    const w = await noticesWorld();
    const n = await createNotice(w, { title: "Holding tax", publishedAt: "2026-10-02T04:00:00Z" });
    const r = await data(await editNotice(w.adminLogin, n.id, { title: "Holding tax — due 15 Jan", emailChange: true }));
    expect(r.emailed).toBe(4);
    expect(await noticeMails(n.id, "EDITED")).toHaveLength(4);
  });

  it("archives once; archived notices are read-only", async () => {
    const w = await noticesWorld();
    const n = await createNotice(w, { title: "Old", publishedAt: "2026-10-02T04:00:00Z", priority: "URGENT" });
    expect((await archiveNotice(w.adminLogin, n.id)).status).toBe(200);
    expect((await error(await editNotice(w.adminLogin, n.id, { title: "New" }))).code).toBe("NOTICE_ARCHIVED");
    expect((await error(await archiveNotice(w.adminLogin, n.id))).code).toBe("NOTICE_ARCHIVED");
    expect((await error(await remind(w.adminLogin, n.id))).code).toBe("NOTICE_ARCHIVED");
    expect(await prisma.auditLog.count({ where: { entityId: n.id, action: "notice.archived" } })).toBe(1);
  });

  it("answers 404 for an unknown notice", async () => {
    const w = await noticesWorld();
    expect((await editNotice(w.adminLogin, crypto.randomUUID(), { title: "x" })).status).toBe(404);
    expect((await readNotice(w.ownerLogin, crypto.randomUUID())).status).toBe(404);
  });
});

describe("read tracking (N4, Rule 4)", () => {
  it("records a read once, keeps the first time, and read-all clears the rest", async () => {
    const w = await noticesWorld();
    const { water, tax } = await sample(w);
    const r = await readNotice(w.ownerLogin, water.id);
    expect(r.status).toBe(200);
    expect((await data(r)).unread).toBe(1);
    vi.setSystemTime(new Date("2026-10-23T06:00:00Z"));
    const later = await loginAs(w.owner);
    await readNotice(later, water.id);
    const row = await prisma.noticeRead.findUniqueOrThrow({ where: { noticeId_userId: { noticeId: water.id, userId: w.owner.id } } });
    expect(row.readAt.toISOString()).toBe("2026-10-22T06:00:00.000Z");
    expect((await data(await readAll(later))).unread).toBe(0);
    expect(await prisma.noticeRead.count({ where: { noticeId: tax.id, userId: w.owner.id } })).toBe(1);
  });

  it("never records a read just by listing", async () => {
    const w = await noticesWorld();
    await sample(w);
    await listNotices(w.ownerLogin);
    expect(await prisma.noticeRead.count({ where: { userId: w.owner.id } })).toBe(1);
  });
});

describe("who has read and Remind unread (N4, G6)", () => {
  it("lists Read with times and Not yet", async () => {
    const w = await noticesWorld();
    const { water } = await sample(w);
    const d = await data(await whoRead(w.adminLogin, water.id));
    expect(d.read.map((r: { name: string }) => r.name).sort()).toEqual(["Rayhan Ahmed", "Tanvir Ahmed"]);
    expect(d.read[0].readAt).toBeTruthy();
    expect(d.notRead.map((r: { name: string }) => r.name).sort()).toEqual(["Farzana Haque", "Nasrin Ahmed"]);
  });

  it("reminds only unread members, once per Dhaka day, urgent only", async () => {
    const w = await noticesWorld();
    const { water, tax } = await sample(w);
    await prisma.user.update({ where: { id: w.farzanaUser.id }, data: { emailNotices: false } });
    const res = await remind(w.adminLogin, water.id);
    expect(res.status).toBe(200);
    expect((await data(res)).reminded).toBe(2);
    const mails = await noticeMails(water.id, "REMINDER");
    expect(new Set(mails.map((m) => m.toUserId))).toEqual(new Set([w.owner.id, w.farzanaUser.id]));
    expect((await error(await remind(w.adminLogin, water.id))).code).toBe("REMINDER_ALREADY_SENT");
    vi.setSystemTime(new Date("2026-10-23T06:00:00Z"));
    const next = await loginAs(w.admin);
    expect((await remind(next, water.id)).status).toBe(200);
    expect((await error(await remind(next, tax.id))).code).toBe("NOT_URGENT");
    expect(await prisma.auditLog.count({ where: { entityId: water.id, action: "notice.reminded" } })).toBe(2);
  });

  it("never counts or emails invited users", async () => {
    const w = await noticesWorld();
    await createUser({ roles: ["OWNER"], status: "INVITED", password: null });
    const { water } = await sample(w);
    const d = await data(await whoRead(w.adminLogin, water.id));
    expect(d.read.length + d.notRead.length).toBe(4);
  });
});
