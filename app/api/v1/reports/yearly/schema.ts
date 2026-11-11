import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { YearlyQuerySchema } from "@/lib/reports/params";
import { registry } from "../../registry";
import { BalanceLabelSchema, bp, csvResponse, HouseSchema, MonthFigureSchema, paisa, reportErrors, ReportStatusSchema } from "../shared";

export { YearlyQuerySchema };

const Sums = z.object({ incomePaisa: paisa, expensesAllPaisa: paisa, fromReservePaisa: paisa, reservePaisa: paisa, distributablePaisa: paisa });
const OwnerMoney = {
  openingPaisa: paisa.meta({ description: "Σ ledger before 1 Jan + OPENING entries booked in the year" }),
  entitlementPaisa: paisa,
  paidOutPaisa: paisa,
  advancesPaisa: paisa,
  loanDeductionPaisa: paisa,
  otherPaisa: paisa,
  balanceNowPaisa: paisa,
  loanOutstandingPaisa: paisa,
};

export const YearlyReportSchema = z
  .object({
    house: HouseSchema,
    year: z.number().int(),
    years: z.array(z.number().int()).meta({ description: "Years with at least one period, newest first" }),
    empty: z.boolean(),
    months: z.array(z.object({ month: MonthKeySchema, status: z.union([ReportStatusSchema, z.literal("NONE")]), figure: MonthFigureSchema.nullable() })).length(12),
    totals: z.object({ closed: Sums, draft: Sums, closedCount: z.number().int(), draftCount: z.number().int() }),
    topExpenseCategories: z.array(z.object({ categoryId: z.uuid(), code: z.string(), nameEn: z.string(), nameBn: z.string(), amountPaisa: paisa, shareBp: bp })).max(5),
    owners: z.object({
      rows: z.array(
        z.object({
          ownerId: z.uuid(),
          displayName: z.string(),
          unitsNow: z.number().int(),
          sharePercentNow: z.number().nullable(),
          shareChanges: z.array(z.object({ month: MonthKeySchema, unitsBefore: z.number().int(), unitsAfter: z.number().int(), percentBefore: z.number(), percentAfter: z.number() })),
          ...OwnerMoney,
          balanceLabel: BalanceLabelSchema,
        }),
      ),
      totals: z.object(OwnerMoney).meta({ description: "Σ entitlement = closed months' distributable" }),
    }),
  })
  .meta({ id: "YearlyReport" });

registry.registerPath({
  method: "get",
  path: "/reports/yearly",
  tags: ["Reports"],
  summary: "Yearly report: 12 month columns, closed vs draft totals, top categories, owner year table",
  description: "Permission `report.view`. Totals count FINAL months; DRAFT months are reported separately. `format=csv` downloads `BariHisab-Yearly-{YYYY}.csv` (month table, then owner table).",
  security: cookieAuthRead,
  request: { query: YearlyQuerySchema },
  responses: {
    200: {
      description: "Yearly report (JSON) or CSV when format=csv",
      content: { ...jsonResponse("", apiSuccessSchema("YearlyReportResponse", YearlyReportSchema)).content, ...csvResponse("").content },
    },
    ...reportErrors,
  },
});
