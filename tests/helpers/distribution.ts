// Distribution PRD §11.1 sample month on top of the Owners sample house
// (clock: 20 Oct 2026). October: income ৳1,03,000, expenses ৳13,980, 5 %
// reserve → distributable ৳84,569; Tanvir's loan has a ৳5,000 instalment;
// Flat 3A (Nusrat Jahan) has not paid rent.
import * as close from "@/app/api/v1/periods/[month]/close/route";
import * as reopen from "@/app/api/v1/periods/[month]/reopen/route";
import * as distribution from "@/app/api/v1/distribution/route";
import { prisma } from "@/lib/prisma";
import { createTxn, createUnit, setReserveRule } from "./factory";
import { apiRequest, json, params, type Login } from "./http";
import { ownersWorld } from "./owners";

export async function distributionWorld() {
  const w = await ownersWorld();
  const p = w.property.id;
  await setReserveRule(p, { mode: "PERCENT", percentBp: 500 });
  const loan = await prisma.loan.findFirstOrThrow({ where: { ownerId: w.owners.tanvir.id } });
  await prisma.loan.update({ where: { id: loan.id }, data: { installmentPaisa: BigInt(500000) } });
  const flat2a = await createUnit(p, { name: "Flat 2A", tenantName: "Karim Uddin", rentPaisa: 1800000 });
  const flat3a = await createUnit(p, { name: "Flat 3A", tenantName: "Nusrat Jahan", rentPaisa: 1800000 });
  const base = { propertyId: p, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id };
  const rent = await createTxn({ ...base, kind: "INCOME", categoryId: w.categories.RENT.id, unitId: flat2a.id, amountPaisa: 1800000 });
  await createTxn({ ...base, kind: "INCOME", categoryId: w.categories.ROOFTOP.id, amountPaisa: 8500000 });
  const elec = await createTxn({ ...base, categoryId: w.categories.ELEC.id, amountPaisa: 1000000 });
  await createTxn({ ...base, categoryId: w.categories.WATER.id, amountPaisa: 398000 });
  return { ...w, loan, units: { flat2a, flat3a }, txns: { rent, elec } };
}

export type DistWorld = Awaited<ReturnType<typeof distributionWorld>>;

export const readBoard = async (login: Login, month?: string) =>
  distribution.GET(apiRequest(`/distribution${month ? `?month=${month}` : ""}`, { login }), params({}));

export const postClose = (login: Login, month: string, reopenCount = 0) =>
  close.POST(apiRequest(`/periods/${month}/close`, { login, body: { reopenCount } }), params({ month }));

export const postReopen = (login: Login, month: string, reason = "Plumber bill was missed") =>
  reopen.POST(apiRequest(`/periods/${month}/reopen`, { login, body: { reason } }), params({ month }));

export const boardData = async (login: Login, month?: string) => (await json(await readBoard(login, month))).data;

/** Rows keyed by first name for readable assertions. */
export const byName = (rows: { displayName: string }[]) => Object.fromEntries(rows.map((r) => [r.displayName.split(" ")[0].toLowerCase(), r])) as Record<string, Record<string, unknown>>;
