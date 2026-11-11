import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { FundsQuerySchema } from "@/lib/reports/params";
import { registry } from "../../registry";
import { HouseSchema, MonthListSchema, paisa, reportErrors } from "../shared";

export { FundsQuerySchema };

const Moves = {
  openingPaisa: paisa,
  incomePaisa: paisa,
  expensesPaisa: paisa,
  ownerPaymentsPaisa: paisa.meta({ description: "Payouts and advances out, net of reversals" }),
  loansOutPaisa: paisa.meta({ description: "Principal of loans disbursed in the period" }),
  loanRepaymentsPaisa: paisa.meta({ description: "Net cash in from loan movements" }),
  closingPaisa: paisa,
};

export const FundsReportSchema = z
  .object({
    house: HouseSchema,
    period: z.discriminatedUnion("kind", [z.object({ kind: z.literal("month"), month: MonthKeySchema }), z.object({ kind: z.literal("year"), year: z.number().int() })]),
    rows: z.array(z.object({ fundAccountId: z.uuid(), name: z.string(), type: z.enum(["CASH", "BANK", "WALLET"]), isActive: z.boolean(), ...Moves })),
    totals: z.object(Moves),
    months: MonthListSchema,
    years: z.array(z.number().int()),
  })
  .meta({ id: "FundsReport" });

registry.registerPath({
  method: "get",
  path: "/reports/funds",
  tags: ["Reports"],
  summary: "Fund accounts report: opening, moves and closing per account for a month or a year",
  description: "Permission `report.view`. Exactly one of `month` or `year`. The current month's closing equals each account's Settings balance.",
  security: cookieAuthRead,
  request: { query: FundsQuerySchema },
  responses: { 200: jsonResponse("Fund accounts report", apiSuccessSchema("FundsReportResponse", FundsReportSchema)), ...reportErrors },
});
