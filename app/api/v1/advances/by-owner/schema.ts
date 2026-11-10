import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IsoDateSchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const StandingSchema = z
  .object({
    ownerId: z.uuid(),
    displayName: z.string(),
    loanOutstandingPaisa: z.number().int(),
    activeLoans: z.number().int(),
    balancePaisa: z.number().int(),
    advanceOutstandingPaisa: z.number().int().meta({ description: "max(0, −balance)" }),
    averageEntitlementPaisa: z.number().int().nullable(),
    limitPaisa: z.number().int().nullable().meta({ description: "null = no limit yet (no closed months)" }),
    limitUsedPct: z.number().int().nullable(),
    lastAdvanceDate: IsoDateSchema.nullable(),
    latestActiveLoan: z.object({ id: z.uuid(), number: z.number().int(), outstandingPaisa: z.number().int() }).nullable(),
  })
  .meta({ id: "OwnerStanding" });

registry.registerPath({
  method: "get",
  path: "/advances/by-owner",
  tags: ["Advances & loans"],
  summary: "Each owner's loans, advance outstanding and advance limit",
  description: "Permission `loan.view` (F13, F14).",
  security: cookieAuthRead,
  responses: { 200: jsonResponse("Standing", apiSuccessSchema("StandingResponse", z.object({ owners: z.array(StandingSchema), multiplierPct: z.number().int() }))), ...readErrors },
});
