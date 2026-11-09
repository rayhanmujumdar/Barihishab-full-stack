// The frozen record of a closed month (Distribution PRD F6.3, G11, Rule 6):
// written once on close, read whole, never recomputed. Paisa are JS numbers
// (always < 2^53). Parsed on read so a malformed row degrades to "no snapshot".
import { z } from "zod";

const paisa = z.number().int();

export const ReserveRuleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("OFF") }),
  z.object({ mode: z.literal("PERCENT"), percentBp: z.number().int().min(1).max(10000) }),
  z.object({ mode: z.literal("FIXED"), fixedPaisa: z.number().int().min(1).max(1_000_000_000) }),
]);

export const SnapshotSchema = z.object({
  v: z.literal(1),
  incomePaisa: paisa,
  expensePaisa: paisa,
  reserveSpentPaisa: paisa,
  reservePaisa: paisa,
  reserveSource: z.enum(["RULE", "OVERRIDE"]),
  reserveRule: ReserveRuleSchema,
  overrideReason: z.string().nullable(),
  previousDeficitPaisa: paisa,
  previousDeficitMonth: z.string().nullable(),
  distributablePaisa: paisa,
  deficitCarriedPaisa: paisa,
  shares: z.array(z.object({ ownerId: z.string(), name: z.string(), units: z.number().int() })),
  entitlements: z.array(z.object({ ownerId: z.string(), amountPaisa: paisa })),
  loanDeductions: z.array(z.object({ ownerId: z.string(), loanId: z.string(), amountPaisa: paisa })),
  skippedLoans: z.array(z.object({ ownerId: z.string(), loanId: z.string() })),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

export function readSnapshot(json: unknown): Snapshot | null {
  const r = SnapshotSchema.safeParse(json);
  return r.success ? r.data : null;
}
