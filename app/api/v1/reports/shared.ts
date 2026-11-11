// Zod pieces shared by the /reports/* OpenAPI schemas (Reports PRD).
import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors } from "@/lib/api/money-schemas";

export const paisa = z.number().int();
export const bp = z.number().int().meta({ description: "Basis points (1% = 100), half-up" });
export const ReportStatusSchema = z.enum(["FINAL", "DRAFT"]).meta({ id: "ReportStatus", description: "FINAL = closed month (snapshot); DRAFT = open month (live)" });
export const PeriodStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const HouseSchema = z.object({ name: z.string(), address: z.string().nullable() }).meta({ id: "ReportHouse" });
export const BalanceLabelSchema = z.enum(["OWED", "ADVANCE", "SETTLED"]);
export const MonthListSchema = z.array(z.object({ key: MonthKeySchema, status: PeriodStatusSchema }));

export const MonthFigureSchema = z
  .object({
    incomePaisa: paisa,
    expensesAllPaisa: paisa.meta({ description: "Every non-voided expense, Reserve-paid included" }),
    fromReservePaisa: paisa,
    expensesCountedPaisa: paisa.meta({ description: "Expenses (all) − paid from Reserve" }),
    reservePaisa: paisa,
    previousDeficitPaisa: paisa,
    distributablePaisa: paisa,
    deficitCarriedPaisa: paisa,
  })
  .meta({ id: "ReportMonthFigure" });

export const csvResponse = (description: string) => ({ description, content: { "text/csv": { schema: z.string().meta({ description: "UTF-8 with BOM, CRLF rows, taka with 2 decimals" }) } } });

export const reportErrors = {
  ...readErrors,
  422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
};
