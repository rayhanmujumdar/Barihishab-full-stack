// Small read helpers shared by the Owners pages (server only).
import "server-only";
import { addMonths } from "@/lib/periods/month";
import type { PeriodDto } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";

/** Months a share set may start in: open months + the month after the latest period (F6). */
export function effectiveMonths(periods: PeriodDto[]): string[] {
  const latest = periods[0]?.month;
  const latestClosed = periods.find((p) => p.status === "CLOSED")?.month ?? "";
  const open = periods.filter((p) => p.status === "OPEN" && p.month > latestClosed).map((p) => p.month);
  return [...new Set([...open.sort(), ...(latest ? [addMonths(latest, 1)] : [])])];
}

/** Users that are not yet linked to an owner of this property (F7). */
export async function linkableUsers(propertyId: string) {
  const users = await prisma.user.findMany({
    where: { status: { not: "INACTIVE" }, owners: { none: { propertyId } } },
    select: { id: true, firstName: true, lastName: true, name: true, username: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: displayName(u) }));
}

export type StatementRange = { year: number; from: string; to: string };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `?year=&from=&to=` for the owner page and its print view; bad values fall back to defaults (F3, G4, G6). */
export function parseRange(sp: Record<string, string | string[] | undefined>, todayIso: string): StatementRange {
  const thisYear = Number(todayIso.slice(0, 4));
  const y = Number(one(sp.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : thisYear;
  const rawFrom = one(sp.from);
  const rawTo = one(sp.to);
  const from = rawFrom && MONTH.test(rawFrom) ? rawFrom : `${thisYear}-01`;
  const to = rawTo && MONTH.test(rawTo) && rawTo >= from ? rawTo : "latest";
  return { year, from, to };
}
