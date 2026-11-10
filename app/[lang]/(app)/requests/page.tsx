import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { RequestsView } from "@/components/requests/RequestsView";
import { ADMIN_TABS, OWNER_TABS, type RequestsPageData, type RequestStatus, type RequestTab, type RequestType } from "@/components/requests/types";
import { isUuid } from "@/lib/api/params";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listFunds } from "@/lib/master-data/fund-service";
import { ensureCurrentPeriod } from "@/lib/periods/period-service";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { decisionContexts } from "@/lib/requests/context-service";
import type { DecisionContext } from "@/lib/requests/dto";
import { listRequests, MAX_LIMIT, requestDetail } from "@/lib/requests/request-read";
import { RequestsSkeleton } from "@/components/skeletons/pages";

type Search = Promise<Record<string, string | string[] | undefined>>;

const TYPES: RequestType[] = ["ADVANCE", "LOAN", "GRANT"];
const STATUSES: RequestStatus[] = ["DISBURSED", "REJECTED", "CANCELLED", "WITHDRAWN"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.requests") };
}

/** Requests (Requests PRD F1–F15; main PRD S8 `/requests`). */
export default async function RequestsPage({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<RequestsSkeleton locale={locale} />}>
      <Requests searchParams={searchParams} />
    </Suspense>
  );
}

async function Requests({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("request.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const sp = await searchParams;
  const owner = isUuid(one(sp.owner)) ? one(sp.owner)! : "";
  const type = (TYPES as string[]).includes(one(sp.type) ?? "") ? (one(sp.type) as RequestType) : "";
  const status = (STATUSES as string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as RequestStatus) : "";
  const y = Number(one(sp.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null;
  const requestId = one(sp.request);
  const l = Number(one(sp.limit));
  const limit = Number.isInteger(l) && l > 0 && l <= MAX_LIMIT ? l : null;

  const propertyId = await currentPropertyId();
  await ensureCurrentPeriod(propertyId);
  const perms = {
    create: can(viewer, "request.create"),
    viewAll: can(viewer, "request.view.all"),
    decide: can(viewer, "request.decide"),
    disburse: can(viewer, "request.disburse"),
    record: can(viewer, "request.record"),
  };
  const who = { userId: viewer.id, viewAll: perms.viewAll };
  const tabs = perms.viewAll ? ADMIN_TABS : OWNER_TABS;
  const tab: RequestTab = (tabs as string[]).includes(one(sp.tab) ?? "") ? (one(sp.tab) as RequestTab) : tabs[0];
  // Sequential reads keep the pool small; each is a handful of queries on one house.
  const list = await listRequests(propertyId, who, { ownerId: owner || undefined, type: type || undefined, status: status || undefined, year: year ?? undefined, limit: limit ?? undefined });
  // One batch for the whole queue: shared figures load once (design D13).
  const pendingRows = list.scope === "all" && tab === "decide" && list.pending.length ? await prisma.moneyRequest.findMany({ where: { id: { in: list.pending.map((r) => r.id) } } }) : [];
  const contexts: Record<string, DecisionContext> = Object.fromEntries(await decisionContexts(propertyId, pendingRows));
  const owners = await prisma.owner.findMany({ where: { propertyId }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }], select: { id: true, displayName: true, userId: true } });
  const funds = perms.disburse ? (await listFunds(propertyId)).filter((f) => f.isActive).map((f) => ({ id: f.id, name: f.name, balancePaisa: f.balancePaisa })) : [];
  const open = await prisma.period.findFirst({ where: { propertyId, status: "OPEN" }, orderBy: { month: "desc" }, select: { month: true } });
  const detail = isUuid(requestId) ? await requestDetail(propertyId, requestId!, who) : null;

  const data: RequestsPageData = {
    tab,
    list,
    contexts,
    filters: { owner, type, status, year, limit },
    perms,
    ownOwnerId: owners.find((o) => o.userId === viewer.id)?.id ?? null,
    owners: owners.map((o) => ({ id: o.id, name: o.displayName })),
    funds,
    openMonth: open ? open.month.toISOString().slice(0, 7) : null,
    detail,
  };
  return <RequestsView locale={locale} data={data} autoNew={one(sp.new) === "1"} />;
}
