import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";

const paisa = z.number().int();
const status = z.enum(["OPEN", "CLOSED"]);

export const DistributionQuerySchema = z.object({ month: MonthKeySchema.optional() });

export const ChangesSchema = z
  .object({
    lines: z.array(z.object({ key: z.string(), beforePaisa: paisa, afterPaisa: paisa, diffPaisa: paisa })),
    owners: z.array(z.object({ ownerId: z.uuid(), displayName: z.string(), beforePaisa: paisa, afterPaisa: paisa, diffPaisa: paisa })),
  })
  .meta({ id: "DistributionChanges", description: "Before → after since the last reopen (F8)" });

export const DistributionSchema = z
  .object({
    month: z.object({
      key: MonthKeySchema,
      status,
      closedBy: z.string().nullable(),
      closedAt: z.iso.datetime().nullable(),
      reopenCount: z.number().int(),
      isLatestClosed: z.boolean(),
      mustCloseFirst: MonthKeySchema.nullable(),
      firstMonth: z.boolean(),
    }),
    months: z.array(z.object({ key: MonthKeySchema, status })),
    staircase: z.object({
      incomePaisa: paisa,
      expensePaisa: paisa,
      reserveSpentPaisa: paisa,
      surplusPaisa: paisa,
      reservePaisa: paisa,
      reserveSource: z.enum(["RULE", "OVERRIDE"]),
      previousDeficitPaisa: paisa,
      previousDeficitMonth: MonthKeySchema.nullable(),
      distributablePaisa: paisa,
      deficitCarriedPaisa: paisa,
    }),
    reserve: z.object({
      rule: z.object({
        mode: z.enum(["OFF", "PERCENT", "FIXED"]),
        percentBp: z.number().int().optional(),
        fixedPaisa: paisa.optional(),
        startingPaisa: paisa.optional().meta({ description: "Only on open months (closed months show the rule saved in their snapshot)" }),
      }),
      overridePaisa: paisa.nullable(),
      overrideReason: z.string().nullable(),
      balancePaisa: paisa,
    }),
    rows: z.array(
      z.object({
        ownerId: z.uuid(),
        displayName: z.string(),
        initials: z.string(),
        isViewer: z.boolean(),
        units: z.number().int(),
        sharePercent: z.number().nullable(),
        openingPaisa: paisa,
        entitlementPaisa: paisa,
        receivedPaisa: paisa,
        advancePaisa: paisa,
        loanDeductionPaisa: paisa,
        otherPaisa: paisa,
        balancePaisa: paisa,
        balanceLabel: z.enum(["OWED", "ADVANCE", "SETTLED"]),
        afterClosePaisa: paisa.nullable(),
        loanOutstandingPaisa: paisa,
      }),
    ),
    totals: z.object({ entitlementPaisa: paisa, receivedPaisa: paisa, advancePaisa: paisa, loanDeductionPaisa: paisa, otherPaisa: paisa }),
    footer: z.object({
      sumEntitlementsPaisa: paisa,
      distributablePaisa: paisa,
      balanced: z.boolean(),
      shares: z.array(z.object({ name: z.string(), units: z.number().int() })),
      rounding: z.literal("largest-remainder"),
    }),
    skippedLoans: z.array(z.object({ ownerId: z.uuid(), displayName: z.string() })),
    reopens: z.array(z.object({ at: z.iso.datetime(), by: z.string(), reason: z.string() })),
    changes: ChangesSchema.nullable(),
    paidAfterClose: z
      .object({
        items: z.array(z.object({ ownerId: z.uuid(), displayName: z.string(), type: z.enum(["PAYOUT", "ADVANCE"]), amountPaisa: paisa, date: z.iso.date() })),
        totalPaisa: paisa,
      })
      .nullable(),
  })
  .meta({ id: "Distribution" });

export const EmptyDistributionSchema = z.object({ month: z.null() }).meta({ id: "EmptyDistribution", description: "No months exist yet (setup not finished)" });

registry.registerPath({
  method: "get",
  path: "/distribution",
  tags: ["Distribution"],
  summary: "A month's staircase and owner board",
  description:
    "Permission `distribution.view` (Distribution PRD F1–F4, F15; DST-01, DST-05). Without `month` → the oldest open month. Open months are a live preview; closed months come only from the snapshot saved at close.",
  security: cookieAuthRead,
  request: { query: DistributionQuerySchema },
  responses: {
    200: jsonResponse("Distribution", apiSuccessSchema("DistributionResponse", z.union([DistributionSchema, EmptyDistributionSchema]))),
    ...readErrors,
    404: jsonResponse("Unknown month", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
