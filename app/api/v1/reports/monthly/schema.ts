import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { MonthlyQuerySchema } from "@/lib/reports/params";
import { registry } from "../../registry";
import { BalanceLabelSchema, bp, csvResponse, HouseSchema, MonthListSchema, paisa, reportErrors, ReportStatusSchema } from "../shared";

export { MonthlyQuerySchema };

const EntrySchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  description: z.string().nullable(),
  vendor: z.string().nullable(),
  unitName: z.string().nullable(),
  fundName: z.string(),
  amountPaisa: paisa,
  fromReserve: z.boolean(),
  attachments: z.array(z.object({ id: z.uuid(), fileName: z.string(), mime: z.string() })).meta({ description: "Open with GET /attachments/{id}/file" }),
});

const CategorySchema = z
  .object({
    categoryId: z.uuid(),
    code: z.string(),
    nameEn: z.string(),
    nameBn: z.string(),
    count: z.number().int(),
    amountPaisa: paisa,
    shareBp: bp,
    previousPaisa: paisa.nullable().meta({ description: "Expenses: same category last month (0 when none; null without a last month). Income: null" }),
    entries: z.array(EntrySchema).meta({ description: "Non-voided entries, newest first" }),
  })
  .meta({ id: "ReportCategory" });

const OwnerFigures = {
  openingPaisa: paisa,
  entitlementPaisa: paisa,
  receivedPaisa: paisa,
  advancePaisa: paisa,
  loanDeductionPaisa: paisa,
  otherPaisa: paisa,
  balancePaisa: paisa,
  loanOutstandingPaisa: paisa,
};

const CompareSchema = z.object({ key: MonthKeySchema, status: ReportStatusSchema, incomePaisa: paisa, expensesAllPaisa: paisa, distributablePaisa: paisa }).nullable();

export const MonthlyReportSchema = z
  .object({
    house: HouseSchema,
    month: z.object({ key: MonthKeySchema, status: ReportStatusSchema, closedAt: z.iso.datetime().nullable(), closedBy: z.string().nullable() }),
    months: MonthListSchema.meta({ description: "Months with a period, newest first" }),
    summary: z.object({ incomePaisa: paisa, expensesAllPaisa: paisa, distributablePaisa: paisa, deficitCarriedPaisa: paisa }),
    income: z.object({ totalPaisa: paisa, count: z.number().int(), categories: z.array(CategorySchema) }),
    expenses: z.object({ totalPaisa: paisa.meta({ description: "Expenses (all)" }), fromReservePaisa: paisa, count: z.number().int(), categories: z.array(CategorySchema) }),
    staircase: z.object({
      incomePaisa: paisa,
      expensesCountedPaisa: paisa,
      reserveSpentPaisa: paisa,
      reservePaisa: paisa,
      reserveSource: z.enum(["RULE", "OVERRIDE"]),
      previousDeficitPaisa: paisa,
      previousDeficitMonth: MonthKeySchema.nullable(),
      distributablePaisa: paisa,
      deficitCarriedPaisa: paisa,
    }),
    owners: z.object({
      rows: z.array(
        z.object({
          ownerId: z.uuid(),
          displayName: z.string(),
          initials: z.string(),
          units: z.number().int(),
          sharePercent: z.number().nullable(),
          ...OwnerFigures,
          balanceLabel: BalanceLabelSchema,
        }),
      ),
      totals: z.object(OwnerFigures).meta({ description: "Σ entitlement = distributable" }),
    }),
    notes: z.object({
      reopen: z.object({ at: z.iso.datetime(), reason: z.string() }).nullable(),
      overrideReason: z.string().nullable(),
      unpaidUnits: z.array(z.object({ name: z.string(), tenantName: z.string().nullable() })),
      deficit: z.object({ amountPaisa: paisa, nextMonth: MonthKeySchema }).nullable(),
    }),
    compare: z.object({ lastMonth: CompareSchema, lastYear: CompareSchema }),
    empty: z.boolean(),
  })
  .meta({ id: "MonthlyReport" });

registry.registerPath({
  method: "get",
  path: "/reports/monthly",
  tags: ["Reports"],
  summary: "Monthly report: income, expenses by category with entries, staircase, owner table, notes, comparisons",
  description:
    "Permission `report.view`. Closed months are FINAL (close snapshot), open months DRAFT (live). Staircase and owner table equal GET /distribution for the month. `format=csv` downloads every entry as `BariHisab-Monthly-{YYYY-MM}[-DRAFT].csv`.",
  security: cookieAuthRead,
  request: { query: MonthlyQuerySchema },
  responses: {
    200: {
      description: "Monthly report (or { month: null } when no month exists), or CSV when format=csv",
      content: {
        ...jsonResponse("", apiSuccessSchema("MonthlyReportResponse", z.union([MonthlyReportSchema, z.object({ month: z.null() })]))).content,
        ...csvResponse("").content,
      },
    },
    ...reportErrors,
    404: jsonResponse("NOT_FOUND — the month has no period", ApiErrorSchema),
  },
});
