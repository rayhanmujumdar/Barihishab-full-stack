// Requests PRD sample data on top of the Owners sample house (clock 20 Oct 2026):
// Nasrin (owner login), Rayhan (Super Admin, also an owner), Tanvir (L1 ৳35,000),
// Farzana, Sabrina (invited). Route wrappers for the /requests API.
import * as listRoute from "@/app/api/v1/requests/route";
import * as contextRoute from "@/app/api/v1/requests/form-context/route";
import * as oneRoute from "@/app/api/v1/requests/[id]/route";
import * as cancelRoute from "@/app/api/v1/requests/[id]/cancel/route";
import * as approveRoute from "@/app/api/v1/requests/[id]/approve/route";
import * as rejectRoute from "@/app/api/v1/requests/[id]/reject/route";
import * as withdrawRoute from "@/app/api/v1/requests/[id]/withdraw/route";
import * as disburseRoute from "@/app/api/v1/requests/[id]/disburse/route";
import { prisma } from "@/lib/prisma";
import { createUser } from "./factory";
import { apiRequest, json, loginAs, params, type Login } from "./http";
import { moneyPost } from "./money";
import { ownersWorld } from "./owners";

export async function requestsWorld() {
  const w = await ownersWorld();
  // Tanvir gets a login so he can ask too.
  const tanvirUser = await createUser({ roles: ["OWNER"], firstName: "Tanvir", locale: "bn" });
  await prisma.owner.update({ where: { id: w.owners.tanvir.id }, data: { userId: tanvirUser.id } });
  return { ...w, tanvirUser, tanvirLogin: await loginAs(tanvirUser) };
}
export type RequestsWorld = Awaited<ReturnType<typeof requestsWorld>>;

export const advanceBody = (over: Record<string, unknown> = {}) => ({
  type: "ADVANCE",
  amountPaisa: 1000000,
  reason: "Cataract surgery deposit at Ispahani Eye Hospital",
  neededBy: "2026-10-30",
  ...over,
});

export const submit = (login: Login, body: unknown) => listRoute.POST(apiRequest("/requests", { login, body }), params({}));
export const list = (login: Login, query = "") => listRoute.GET(apiRequest(`/requests${query}`, { login }), params({}));
export const formContext = (login: Login, query = "") => contextRoute.GET(apiRequest(`/requests/form-context${query}`, { login }), params({}));
export const detail = (login: Login, id: string) => oneRoute.GET(apiRequest(`/requests/${id}`, { login }), params({ id }));
export const edit = (login: Login, id: string, body: unknown) => oneRoute.PATCH(apiRequest(`/requests/${id}`, { method: "PATCH", login, body }), params({ id }));
export const cancel = (login: Login, id: string) => cancelRoute.POST(apiRequest(`/requests/${id}/cancel`, { login, body: {} }), params({ id }));
export const approve = (login: Login, id: string, body: unknown = {}) => approveRoute.POST(apiRequest(`/requests/${id}/approve`, { login, body }), params({ id }));
export const reject = (login: Login, id: string, reason: unknown = "Existing loan L2 still has ৳40,000 outstanding") =>
  rejectRoute.POST(apiRequest(`/requests/${id}/reject`, { login, body: { reason } }), params({ id }));
export const withdraw = (login: Login, id: string, reason: unknown = "House Fund ran short this month") =>
  withdrawRoute.POST(apiRequest(`/requests/${id}/withdraw`, { login, body: { reason } }), params({ id }));
export const disburse = (login: Login, id: string, body: unknown, key?: string) => disburseRoute.POST(moneyPost(`/requests/${id}/disburse`, login, body, key), params({ id }));

export const data = async (res: Response) => (await json(res)).data;
export const error = async (res: Response) => (await json(res)).error;

/** Submits as the login and returns the created request id. */
export async function submitted(login: Login, over: Record<string, unknown> = {}): Promise<string> {
  const res = await submit(login, advanceBody(over));
  if (res.status !== 201) throw new Error(`submit failed: ${res.status} ${JSON.stringify(await json(res))}`);
  return (await json(res)).data.request.id;
}

export const outbox = (requestId: string, event?: string) =>
  prisma.emailOutbox.findMany({ where: { template: "REQUEST_UPDATE", payload: { path: ["requestId"], equals: requestId }, ...(event ? { AND: [{ payload: { path: ["event"], equals: event } }] } : {}) } });
