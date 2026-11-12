// Notices & Complaints PRD sample house on top of the Requests world (clock
// 20–22 Oct 2026): Rayhan (Super Admin, also an owner), Nasrin, Tanvir and
// Farzana (owner logins) = 4 active members; Sabrina is INVITED.
import * as listRoute from "@/app/api/v1/notices/route";
import * as oneRoute from "@/app/api/v1/notices/[id]/route";
import * as archiveRoute from "@/app/api/v1/notices/[id]/archive/route";
import * as readRoute from "@/app/api/v1/notices/[id]/read/route";
import * as readsRoute from "@/app/api/v1/notices/[id]/reads/route";
import * as remindRoute from "@/app/api/v1/notices/[id]/remind/route";
import * as readAllRoute from "@/app/api/v1/notices/read-all/route";
import * as complaintsRoute from "@/app/api/v1/complaints/route";
import * as complaintRoute from "@/app/api/v1/complaints/[id]/route";
import * as statusRoute from "@/app/api/v1/complaints/[id]/status/route";
import * as withdrawRoute from "@/app/api/v1/complaints/[id]/withdraw/route";
import * as reopenRoute from "@/app/api/v1/complaints/[id]/reopen/route";
import * as publishRoute from "@/app/api/v1/complaints/[id]/publish/route";
import * as seenRoute from "@/app/api/v1/complaints/[id]/seen/route";
import * as commentsRoute from "@/app/api/v1/complaints/[id]/comments/route";
import * as commentRoute from "@/app/api/v1/complaints/[id]/comments/[commentId]/route";
import * as hideRoute from "@/app/api/v1/complaints/[id]/comments/[commentId]/hide/route";
import * as linksRoute from "@/app/api/v1/complaints/links/route";
import * as linkRoute from "@/app/api/v1/complaints/links/[type]/[id]/route";
import * as questionedRoute from "@/app/api/v1/complaints/questioned/route";
import { prisma } from "@/lib/prisma";
import { createTxn, createUser } from "./factory";
import { apiRequest, json, loginAs, params, type Login } from "./http";
import { requestsWorld } from "./requests";

export async function noticesWorld() {
  const w = await requestsWorld();
  await prisma.user.update({ where: { id: w.tanvirUser.id }, data: { lastName: "Ahmed" } });
  const farzanaUser = await createUser({ roles: ["OWNER"], firstName: "Farzana", locale: "en" });
  await prisma.user.update({ where: { id: farzanaUser.id }, data: { lastName: "Haque" } });
  await prisma.owner.update({ where: { id: w.owners.farzana.id }, data: { userId: farzanaUser.id } });
  return { ...w, farzanaUser, farzanaLogin: await loginAs(farzanaUser) };
}
export type NoticesWorld = Awaited<ReturnType<typeof noticesWorld>>;

export const noticeBody = (over: Record<string, unknown> = {}) => ({
  title: "Water tank cleaning — Sunday 26 Oct",
  body: "Supply will be off from **10 am to 2 pm**.\n- Store water the night before",
  priority: "URGENT",
  pinned: true,
  pinUntil: "2026-10-26",
  ...over,
});

/** A notice row straight in the DB (list/order tests), with optional reads. */
export async function createNotice(
  w: NoticesWorld,
  data: { title: string; publishedAt: string; priority?: "NORMAL" | "URGENT"; pinned?: boolean; pinUntil?: string; readBy?: string[] },
) {
  const n = await prisma.notice.create({
    data: {
      propertyId: w.property.id,
      title: data.title,
      body: `${data.title} body`,
      priority: data.priority ?? "NORMAL",
      pinned: data.pinned ?? false,
      pinUntil: data.pinUntil ? new Date(`${data.pinUntil}T00:00:00Z`) : null,
      publishedAt: new Date(data.publishedAt),
      createdById: w.admin.id,
    },
  });
  for (const userId of data.readBy ?? []) await prisma.noticeRead.create({ data: { noticeId: n.id, userId } });
  return n;
}

export const listNotices = (login: Login, query = "") => listRoute.GET(apiRequest(`/notices${query}`, { login }), params({}));
export const publishNotice = (login: Login, body: unknown) => listRoute.POST(apiRequest("/notices", { login, body }), params({}));
export const editNotice = (login: Login, id: string, body: unknown) => oneRoute.PATCH(apiRequest(`/notices/${id}`, { method: "PATCH", login, body }), params({ id }));
export const archiveNotice = (login: Login, id: string) => archiveRoute.POST(apiRequest(`/notices/${id}/archive`, { login, body: {} }), params({ id }));
export const readNotice = (login: Login, id: string) => readRoute.POST(apiRequest(`/notices/${id}/read`, { login, body: {} }), params({ id }));
export const readAll = (login: Login) => readAllRoute.POST(apiRequest("/notices/read-all", { login, body: {} }), params({}));
export const whoRead = (login: Login, id: string) => readsRoute.GET(apiRequest(`/notices/${id}/reads`, { login }), params({ id }));
export const remind = (login: Login, id: string) => remindRoute.POST(apiRequest(`/notices/${id}/remind`, { login, body: {} }), params({ id }));

export const data = async (res: Response) => (await json(res)).data;
export const error = async (res: Response) => (await json(res)).error;

export const noticeMails = (noticeId: string, event?: string) =>
  prisma.emailOutbox.findMany({
    where: { template: "NOTICE", payload: { path: ["noticeId"], equals: noticeId }, ...(event ? { AND: [{ payload: { path: ["event"], equals: event } }] } : {}) },
  });

// ─── Complaints ───

/** The noticesWorld plus an October Electricity expense of ৳7,100 (PRD flow 8.2). */
export async function complaintsWorld() {
  const w = await noticesWorld();
  const electricity = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.ELEC.id, fundAccountId: w.cash.id, createdById: w.admin.id, amountPaisa: 710000, txnDate: "2026-10-05" });
  return { ...w, electricity };
}
export type ComplaintsWorld = Awaited<ReturnType<typeof complaintsWorld>>;

export const complaintBody = (over: Record<string, unknown> = {}) => ({
  title: "September electricity bill looks high",
  body: "In March it was ৳4,600. Was the reading checked?",
  visibility: "ALL",
  ...over,
});

const q = (query: string) => (query ? `?${query}` : "");
export const raise = (login: Login, body: unknown) => complaintsRoute.POST(apiRequest("/complaints", { login, body }), params({}));
export const listComplaints = (login: Login, query = "") => complaintsRoute.GET(apiRequest(`/complaints${q(query)}`, { login }), params({}));
export const complaintDetail = (login: Login, id: string, query = "") => complaintRoute.GET(apiRequest(`/complaints/${id}${q(query)}`, { login }), params({ id }));
export const setStatus = (login: Login, id: string, body: unknown) => statusRoute.PATCH(apiRequest(`/complaints/${id}/status`, { method: "PATCH", login, body }), params({ id }));
export const withdraw = (login: Login, id: string) => withdrawRoute.POST(apiRequest(`/complaints/${id}/withdraw`, { login, body: {} }), params({ id }));
export const reopen = (login: Login, id: string, comment: unknown) => reopenRoute.POST(apiRequest(`/complaints/${id}/reopen`, { login, body: { comment } }), params({ id }));
export const publish = (login: Login, id: string) => publishRoute.POST(apiRequest(`/complaints/${id}/publish`, { login, body: {} }), params({ id }));
export const seen = (login: Login, id: string) => seenRoute.POST(apiRequest(`/complaints/${id}/seen`, { login, body: {} }), params({ id }));
export const comment = (login: Login, id: string, body: unknown) => commentsRoute.POST(apiRequest(`/complaints/${id}/comments`, { login, body }), params({ id }));
export const editComment = (login: Login, id: string, commentId: string, body: unknown) =>
  commentRoute.PATCH(apiRequest(`/complaints/${id}/comments/${commentId}`, { method: "PATCH", login, body }), params({ id, commentId }));
export const hideComment = (login: Login, id: string, commentId: string, reason: unknown) =>
  hideRoute.POST(apiRequest(`/complaints/${id}/comments/${commentId}/hide`, { login, body: { reason } }), params({ id, commentId }));
export const linkOptions = (login: Login, query: string) => linksRoute.GET(apiRequest(`/complaints/links?${query}`, { login }), params({}));
export const linkOne = (login: Login, type: string, id: string, query = "") => linkRoute.GET(apiRequest(`/complaints/links/${type}/${id}${q(query)}`, { login }), params({ type, id }));
export const questioned = (login: Login, query: string) => questionedRoute.GET(apiRequest(`/complaints/questioned?${query}`, { login }), params({}));

/** Raises as the login and returns the created complaint id. */
export async function raised(login: Login, over: Record<string, unknown> = {}): Promise<string> {
  const res = await raise(login, complaintBody(over));
  if (res.status !== 201) throw new Error(`raise failed: ${res.status} ${JSON.stringify(await json(res))}`);
  return (await json(res)).data.complaint.id;
}

export const complaintMails = (complaintId: string, event?: string) =>
  prisma.emailOutbox.findMany({
    where: { template: "COMPLAINT_UPDATE", payload: { path: ["complaintId"], equals: complaintId }, ...(event ? { AND: [{ payload: { path: ["event"], equals: event } }] } : {}) },
  });
