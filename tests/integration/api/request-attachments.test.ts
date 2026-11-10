import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as presign from "@/app/api/v1/attachments/presign/route";
import * as meta from "@/app/api/v1/attachments/[id]/route";
import * as file from "@/app/api/v1/attachments/[id]/file/route";
import { prisma } from "@/lib/prisma";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { advanceBody, approve, data, detail, disburse, edit, error, requestsWorld, submit } from "../../helpers/requests";

let store: ReturnType<typeof useFakeStorage>;
beforeEach(() => {
  freezeDhaka(vi);
  store = useFakeStorage();
});
afterEach(() => {
  vi.useRealTimers();
  store.reset();
});

async function upload(login: Login, name = "estimate.pdf") {
  const res = await presign.POST(apiRequest("/attachments/presign", { login, body: { fileName: name, mime: "application/pdf", size: 64 } }), params({}));
  const id = (await json(res)).data.attachmentId as string;
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
  store.put(row.storageKey, fileBytes("pdf"));
  return id;
}

const getFile = (login: Login, id: string) => file.GET(apiRequest(`/attachments/${id}/file`, { login }), params({ id }));
const getMeta = (login: Login, id: string) => meta.GET(apiRequest(`/attachments/${id}`, { login }), params({ id }));

describe("request attachments (F15, G8, Rule 12)", () => {
  it("links up to 3 files, marks private ones, and lists them on the detail", async () => {
    const w = await requestsWorld();
    const pub = await upload(w.ownerLogin, "estimate.pdf");
    const priv = await upload(w.ownerLogin, "report.pdf");
    const res = await submit(w.ownerLogin, advanceBody({ attachmentIds: [pub, priv], privateAttachmentIds: [priv] }));
    expect(res.status).toBe(201);
    const { request } = await data(res);
    expect(request.attachmentCount).toBe(2);
    const d = await data(await detail(w.ownerLogin, request.id));
    expect(d.attachments.map((a: { fileName: string; isPrivate: boolean }) => [a.fileName, a.isPrivate])).toEqual([
      ["estimate.pdf", false],
      ["report.pdf", true],
    ]);
    expect(await prisma.attachment.count({ where: { entityType: "money_request", entityId: request.id } })).toBe(2);
  });

  it("refuses a 4th file on edit and someone else's upload", async () => {
    const w = await requestsWorld();
    const ids = [await upload(w.ownerLogin), await upload(w.ownerLogin), await upload(w.ownerLogin)];
    const { request } = await data(await submit(w.ownerLogin, advanceBody({ attachmentIds: ids })));
    const extra = await upload(w.ownerLogin);
    expect((await error(await edit(w.ownerLogin, request.id, { attachmentIds: [extra] }))).details.fields).toEqual({ attachmentIds: "At most 3 files." });
    // Removing one makes room.
    expect((await edit(w.ownerLogin, request.id, { attachmentIds: [extra], removeAttachmentIds: [ids[0]] })).status).toBe(200);
    const theirs = await upload(w.tanvirLogin);
    expect((await error(await submit(w.ownerLogin, advanceBody({ attachmentIds: [theirs] })))).details.fields).toHaveProperty("attachmentIds");
  });

  it("hides a pending request's files from other owners", async () => {
    const w = await requestsWorld();
    const id = await upload(w.ownerLogin);
    await submit(w.ownerLogin, advanceBody({ attachmentIds: [id] }));
    expect((await getFile(w.tanvirLogin, id)).status).toBe(404);
    expect((await getMeta(w.tanvirLogin, id)).status).toBe(404);
    expect((await getFile(w.ownerLogin, id)).status).toBe(200);
    expect((await getFile(w.adminLogin, id)).status).toBe(200);
  });

  it("shows paid-out files to every owner, except private ones", async () => {
    const w = await requestsWorld();
    const pub = await upload(w.ownerLogin);
    const priv = await upload(w.ownerLogin);
    const { request } = await data(await submit(w.ownerLogin, advanceBody({ attachmentIds: [pub, priv], privateAttachmentIds: [priv] })));
    await approve(w.adminLogin, request.id);
    expect((await disburse(w.adminLogin, request.id, { date: "2026-10-20", fundAccountId: w.cash.id, method: "CASH" })).status).toBe(201);
    expect((await getFile(w.tanvirLogin, pub)).status).toBe(200);
    expect((await getFile(w.tanvirLogin, priv)).status).toBe(404);
    expect((await getFile(w.ownerLogin, priv)).status).toBe(200);
    expect((await getFile(w.adminLogin, priv)).status).toBe(200);
    const d = await data(await detail(w.tanvirLogin, request.id));
    expect(d.attachments.map((a: { id: string }) => a.id)).toEqual([pub]);
    expect(d.request.attachmentCount).toBe(1);
  });
});
