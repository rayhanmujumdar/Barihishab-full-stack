// Soft warnings (Income & Expenses PRD §10.5): returned with the saved entry,
// never blocking. RESERVE_LOW waits for the Distribution module.
import { daysFromPeriod } from "@/lib/periods/month";

export type Warning =
  | { code: "RENT_ALREADY_RECORDED" }
  | { code: "POSSIBLE_DUPLICATE" }
  | { code: "FUND_NEGATIVE"; fundAccountId: string; balancePaisa: number }
  | { code: "DATE_FAR_FROM_PERIOD" };

export const FAR_DAYS = 45;

export function buildWarnings(w: {
  rentAlreadyRecorded: boolean;
  possibleDuplicate: boolean;
  fundAccountId: string;
  fundBalancePaisa: number;
  txnDate: string;
  periodMonth: string;
}): Warning[] {
  const out: Warning[] = [];
  if (w.rentAlreadyRecorded) out.push({ code: "RENT_ALREADY_RECORDED" });
  if (w.possibleDuplicate) out.push({ code: "POSSIBLE_DUPLICATE" });
  if (w.fundBalancePaisa < 0) out.push({ code: "FUND_NEGATIVE", fundAccountId: w.fundAccountId, balancePaisa: w.fundBalancePaisa });
  if (daysFromPeriod(w.txnDate, w.periodMonth) > FAR_DAYS) out.push({ code: "DATE_FAR_FROM_PERIOD" });
  return out;
}
