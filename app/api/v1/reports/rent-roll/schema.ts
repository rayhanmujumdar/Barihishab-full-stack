import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { RentRollQuerySchema } from "@/lib/reports/params";
import { registry } from "../../registry";
import { bp, HouseSchema, paisa, reportErrors, ReportStatusSchema } from "../shared";

export { RentRollQuerySchema };

const CellSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PAID"), amountPaisa: paisa, entryIds: z.array(z.uuid()) }),
  z.object({ kind: z.literal("ARREAR"), paidIn: MonthKeySchema.meta({ description: "Month the late rent was booked in" }), amountPaisa: paisa, entryIds: z.array(z.uuid()) }),
  z.object({ kind: z.literal("NONE") }),
]);

export const RentRollSchema = z
  .object({
    house: HouseSchema,
    year: z.number().int(),
    years: z.array(z.number().int()),
    months: z.array(z.object({ key: MonthKeySchema, status: z.union([ReportStatusSchema, z.literal("NONE")]), totalPaisa: paisa, expectedPaisa: paisa.nullable(), collectionBp: bp.nullable() })).length(12),
    rows: z.array(z.object({ unitId: z.uuid(), name: z.string(), tenantName: z.string().nullable(), cells: z.array(CellSchema).length(12), totalPaisa: paisa, expectedPaisa: paisa })),
  })
  .meta({ id: "RentRoll" });

registry.registerPath({
  method: "get",
  path: "/reports/rent-roll",
  tags: ["Reports"],
  summary: "Rent roll: each month's own rent per unit — paid on time, paid late (arrear) or missing",
  description: "Permission `report.view`. Income entries with a unit, by the month they were booked to; ARREAR when the month's rent was booked in a later month.",
  security: cookieAuthRead,
  request: { query: RentRollQuerySchema },
  responses: { 200: jsonResponse("Rent roll", apiSuccessSchema("RentRollResponse", RentRollSchema)), ...reportErrors },
});
