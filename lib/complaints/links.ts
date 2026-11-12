// What a complaint can question (G9; design D2): entry, month, owner
// payment/advance, loan, request or share change. Links are (type, id) pairs
// without FKs — every linked table refuses deletes — and their labels are
// built when read, so a corrected entry shows its current figures.
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatRequestNumber, visibleTo } from "@/lib/accounting/requests";
import { todayIsoInDhaka } from "@/lib/clock";
import type { Locale } from "@/lib/i18n";
import { monthKey, monthLabel } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { prefillTitle } from "./rules";

type Db = Prisma.TransactionClient | typeof prisma;

import type { LinkItem, LinkOption, LinkRef, LinkType } from "./link-types";

export { LINK_TYPES, type LinkItem, type LinkOption, type LinkRef, type LinkType } from "./link-types";
type Resolved = LinkItem & { periodId: string | null; aboutAdmin: boolean };

/** The caller and whether they hold `request.view.all` (requests have their own visibility). */
export type LinkViewer = { userId: string; requestViewAll: boolean };

export const linkKey = (r: LinkRef) => `${r.type}:${r.id}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const SCAN = 300;

/** Owners whose user is a Super Admin of this house (G14 "Admin's own entry"). */
async function adminOwnerIds(db: Db, propertyId: string): Promise<Set<string>> {
  const rows = await db.owner.findMany({
    where: { propertyId, user: { roles: { some: { role: "SUPER_ADMIN", OR: [{ propertyId: null }, { propertyId }] } } } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** Entry search runs in SQL so older entries stay findable past the newest-SCAN window. */
const entryMatch = (q: string): Prisma.HouseTransactionWhereInput[] => {
  const has = { contains: q, mode: "insensitive" as const };
  return [{ category: { nameEn: has } }, { category: { nameBn: has } }, { vendor: has }, { description: has }];
};

/** Loads items of one type: the given ids, or (ids = null) the newest ones for the picker. */
async function load(db: Db, propertyId: string, type: LinkType, ids: string[] | null, locale: Locale, viewer: LinkViewer, q = ""): Promise<Resolved[]> {
  const pick = ids ? { id: { in: ids } } : {};
  const take = ids ? undefined : SCAN;
  const bn = locale === "bn";
  const admins = type === "MONTH" || type === "SHARE_SET" ? new Set<string>() : await adminOwnerIds(db, propertyId);
  const base = { hidden: false, aboutAdmin: false, periodId: null, month: null, date: null, amountPaisa: null } as const;
  switch (type) {
    case "ENTRY": {
      const rows = await db.houseTransaction.findMany({
        where: { propertyId, ...pick, ...(ids ? {} : { voidedAt: null }), ...(q ? { OR: entryMatch(q) } : {}) },
        select: { id: true, txnDate: true, amountPaisa: true, periodId: true, beneficiaryOwnerId: true, vendor: true, description: true, category: { select: { nameEn: true, nameBn: true } }, period: { select: { month: true } } },
        orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
        take,
      });
      return rows.map((t) => ({
        ...base,
        type,
        id: t.id,
        subject: bn ? t.category.nameBn : t.category.nameEn,
        date: iso(t.txnDate),
        amountPaisa: Number(t.amountPaisa),
        month: monthKey(t.period.month),
        periodId: t.periodId,
        aboutAdmin: t.beneficiaryOwnerId !== null && admins.has(t.beneficiaryOwnerId),
        search: [t.category.nameEn, t.category.nameBn, t.vendor, t.description].filter(Boolean).join(" "),
      }));
    }
    case "MONTH": {
      const rows = await db.period.findMany({ where: { propertyId, ...pick }, select: { id: true, month: true }, orderBy: { month: "desc" }, take });
      return rows.map((p) => ({ ...base, type, id: p.id, subject: monthLabel(locale, monthKey(p.month)), month: monthKey(p.month), periodId: p.id }));
    }
    case "LEDGER": {
      const rows = await db.ownerLedgerEntry.findMany({
        where: { propertyId, type: { in: ["PAYOUT", "ADVANCE"] }, ...pick, ...(ids ? {} : { voidedAt: null }) },
        select: { id: true, type: true, entryDate: true, amountPaisa: true, periodId: true, ownerId: true, owner: { select: { displayName: true } }, period: { select: { month: true } } },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take,
      });
      return rows.map((e) => {
        const what = e.type === "ADVANCE" ? (bn ? "অগ্রিম" : "advance") : bn ? "পরিশোধ" : "payment";
        return {
          ...base,
          type,
          id: e.id,
          subject: bn ? `${e.owner.displayName}-এর ${what}` : `${e.owner.displayName}'s ${what}`,
          date: iso(e.entryDate),
          amountPaisa: Math.abs(Number(e.amountPaisa)),
          month: monthKey(e.period.month),
          periodId: e.periodId,
          aboutAdmin: admins.has(e.ownerId),
        };
      });
    }
    case "LOAN": {
      const rows = await db.loan.findMany({
        where: { propertyId, ...pick },
        select: { id: true, number: true, principalPaisa: true, disbursedOn: true, ownerId: true, owner: { select: { displayName: true } } },
        orderBy: [{ disbursedOn: "desc" }, { number: "desc" }],
        take,
      });
      return rows.map((l) => ({
        ...base,
        type,
        id: l.id,
        subject: `${bn ? "ঋণ" : "Loan"} L${l.number} · ${l.owner.displayName}`,
        date: iso(l.disbursedOn),
        amountPaisa: Number(l.principalPaisa),
        aboutAdmin: admins.has(l.ownerId),
      }));
    }
    case "REQUEST": {
      const rows = await db.moneyRequest.findMany({
        where: { propertyId, ...pick },
        select: { id: true, year: true, number: true, status: true, createdById: true, createdAt: true, ownerId: true, owner: { select: { displayName: true, userId: true } } },
        orderBy: { createdAt: "desc" },
        take,
      });
      return rows.map((r) => {
        const visible = visibleTo({ status: r.status, ownerUserId: r.owner.userId, createdById: r.createdById }, { userId: viewer.userId, viewAll: viewer.requestViewAll }) !== "none";
        return {
          ...base,
          type,
          id: r.id,
          hidden: !visible,
          subject: visible ? `${bn ? "অনুরোধ" : "Request"} ${formatRequestNumber(r.year, r.number)} · ${r.owner.displayName}` : null,
          date: visible ? todayIsoInDhaka(r.createdAt) : null,
          aboutAdmin: admins.has(r.ownerId),
        };
      });
    }
    case "SHARE_SET": {
      const rows = await db.shareSet.findMany({ where: { propertyId, ...pick }, select: { id: true, effectiveFrom: true }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take });
      return rows.map((s) => {
        const from = monthLabel(locale, monthKey(s.effectiveFrom));
        return { ...base, type, id: s.id, subject: bn ? `${from} থেকে শেয়ার বদল` : `Share change from ${from}`, date: iso(s.effectiveFrom) };
      });
    }
  }
}

const strip = (r: Resolved): LinkItem => ({ type: r.type, id: r.id, subject: r.subject, date: r.date, amountPaisa: r.amountPaisa, month: r.month, hidden: r.hidden });
const option = (r: Resolved, locale: Locale): LinkOption => ({
  ...strip(r),
  prefill: prefillTitle(locale, r.subject ?? "", r.type === "MONTH" || !r.month ? null : monthLabel(locale, r.month)),
});

/** Labels for many links at once (one query per type present). Unknown ids are absent. */
export async function resolveLinks(db: Db, propertyId: string, refs: readonly (LinkRef | null)[], locale: Locale, viewer: LinkViewer): Promise<Map<string, LinkItem>> {
  const out = new Map<string, LinkItem>();
  const byType = new Map<LinkType, string[]>();
  for (const r of refs) if (r) byType.set(r.type, [...(byType.get(r.type) ?? []), r.id]);
  for (const [type, ids] of byType) {
    for (const item of await load(db, propertyId, type, [...new Set(ids)], locale, viewer)) {
      out.set(linkKey(item), item.hidden ? { type, id: item.id, subject: null, date: null, amountPaisa: null, month: null, hidden: true } : strip(item));
    }
  }
  return out;
}

/** Write-time check: the item exists in this house and the viewer may see it. */
export async function validateLink(db: Db, propertyId: string, ref: LinkRef, viewer: LinkViewer): Promise<Resolved | null> {
  const [item] = await load(db, propertyId, ref.type, [ref.id], "en", viewer);
  return item && !item.hidden ? item : null;
}

/** Picker search (C2): up to 20 visible items of a type, newest first. */
export async function linkOptions(propertyId: string, type: LinkType, q: string, locale: Locale, viewer: LinkViewer): Promise<LinkOption[]> {
  const needle = q.trim().toLocaleLowerCase();
  const rows = (await load(prisma, propertyId, type, null, locale, viewer, q.trim())).filter((r) => !r.hidden);
  const hits = needle ? rows.filter((r) => `${r.subject ?? ""} ${(r as { search?: string }).search ?? ""}`.toLocaleLowerCase().includes(needle)) : rows;
  return hits.slice(0, 20).map((r) => option(r, locale));
}

/** One item for "Raise an objection" pre-fill, or null when missing/invisible. */
export async function linkOption(propertyId: string, ref: LinkRef, locale: Locale, viewer: LinkViewer): Promise<LinkOption | null> {
  const [item] = await load(prisma, propertyId, ref.type, [ref.id], locale, viewer);
  return item && !item.hidden ? option(item, locale) : null;
}
