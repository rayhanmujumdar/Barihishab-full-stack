// The "From request R-2026-014" link carried by entries a disbursal created
// (Requests PRD §2.1 Other places). Client-safe.
import { formatRequestNumber } from "@/lib/accounting/requests";

export type RequestRef = { id: string; number: string } | null;

/** Prisma select for the linked request on ledger entries, loans and expenses. */
export const REQUEST_REF_SELECT = { select: { id: true, year: true, number: true } } as const;

export function requestRef(r: { id: string; year: number; number: number } | null | undefined): RequestRef {
  return r ? { id: r.id, number: formatRequestNumber(r.year, r.number) } : null;
}
