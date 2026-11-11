// Calls the /api/v1/reports/* route handlers directly (Reports PRD).
import { prisma } from "@/lib/prisma";
import { apiRequest, json, params, type Login } from "./http";

// Lazy so each report's tests run before the other routes exist.
const routes = {
  monthly: () => import("@/app/api/v1/reports/monthly/route"),
  yearly: () => import("@/app/api/v1/reports/yearly/route"),
  "rent-roll": () => import("@/app/api/v1/reports/rent-roll/route"),
  expenses: () => import("@/app/api/v1/reports/expenses/route"),
  funds: () => import("@/app/api/v1/reports/funds/route"),
} as const;
export type ReportName = keyof typeof routes;

export const getReport = async (name: ReportName, login: Login | null, query = ""): Promise<Response> =>
  (await routes[name]()).GET(apiRequest(`/reports/${name}${query ? `?${query}` : ""}`, login ? { login } : {}), params({}));

export const reportData = async (name: ReportName, login: Login, query = "") => {
  const res = await getReport(name, login, query);
  if (res.status !== 200) throw new Error(`${name}?${query} → ${res.status} ${await res.text()}`);
  return (await json(res)).data;
};

/** A linked bill on an entry (attachments are created unlinked at presign, then linked). */
export function attachBill(propertyId: string, entityId: string, uploadedById: string, opts: { fileName?: string; mime?: string; removed?: boolean; isPrivate?: boolean } = {}) {
  return prisma.attachment.create({
    data: {
      propertyId,
      entityType: "house_transaction",
      entityId,
      storageKey: `test/${crypto.randomUUID()}`,
      fileName: opts.fileName ?? "desco-oct.pdf",
      mime: opts.mime ?? "application/pdf",
      sizeBytes: 1234,
      uploadedById,
      linkedAt: new Date(),
      isPrivate: opts.isPrivate ?? false,
      ...(opts.removed ? { removedAt: new Date(), removedById: uploadedById } : {}),
    },
  });
}
