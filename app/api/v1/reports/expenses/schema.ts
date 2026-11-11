import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { ExpensesQuerySchema } from "@/lib/reports/params";
import { registry } from "../../registry";
import { bp, HouseSchema, paisa, reportErrors } from "../shared";

export { ExpensesQuerySchema };

const CategoryRef = { code: z.string(), nameEn: z.string(), nameBn: z.string() };

export const ExpenseAnalysisSchema = z
  .object({
    house: HouseSchema,
    from: MonthKeySchema,
    to: MonthKeySchema,
    categoryIds: z.array(z.uuid()),
    totalPaisa: paisa.meta({ description: "Expenses (all) in the range" }),
    fromReservePaisa: paisa,
    count: z.number().int(),
    byCategory: z.array(z.object({ categoryId: z.uuid(), ...CategoryRef, amountPaisa: paisa, shareBp: bp, count: z.number().int() })),
    topVendors: z.array(z.object({ vendor: z.string().nullable().meta({ description: "null = entries without a vendor" }), amountPaisa: paisa, count: z.number().int() })).max(10),
    trend: z.array(z.object({ month: MonthKeySchema, amounts: z.record(z.uuid(), paisa).meta({ description: "Per selected category (empty without a filter)" }), totalPaisa: paisa })),
    topExpenses: z
      .array(z.object({ id: z.uuid(), date: z.iso.date(), month: MonthKeySchema, categoryNameEn: z.string(), categoryNameBn: z.string(), description: z.string().nullable(), vendor: z.string().nullable(), amountPaisa: paisa }))
      .max(10),
    categories: z.array(z.object({ id: z.uuid(), ...CategoryRef })).meta({ description: "Expense categories to filter by" }),
  })
  .meta({ id: "ExpenseAnalysis" });

registry.registerPath({
  method: "get",
  path: "/reports/expenses",
  tags: ["Reports"],
  summary: "Expense analysis over a month range: by category, vendors, trend, biggest expenses",
  description: "Permission `report.view`. Range of at most 36 months; `categoryId` may repeat or be comma-separated. Voided entries never count.",
  security: cookieAuthRead,
  request: { query: ExpensesQuerySchema },
  responses: { 200: jsonResponse("Expense analysis", apiSuccessSchema("ExpenseAnalysisResponse", ExpenseAnalysisSchema)), ...reportErrors },
});
