// Reads report pages' search params; bad values fall back to defaults (reports-ui).
import { isMonthKey } from "@/lib/periods/month";
import { YearSchema } from "./params";

export type Search = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).flatMap((x) => x.split(",")).filter(Boolean);

export function monthParam(sp: Search, key = "month"): string | null {
  const v = one(sp[key]);
  return v && isMonthKey(v) ? v : null;
}

export function yearParam(sp: Search): number | null {
  const v = one(sp.year);
  return v && YearSchema.safeParse(v).success ? Number(v) : null;
}
