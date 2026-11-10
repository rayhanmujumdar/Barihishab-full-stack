import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { REQUESTS_TAG } from "../schema";

export const FormContextQuerySchema = z
  .object({
    ownerId: z.uuid("Pick an owner.").optional(),
    amountPaisa: z.string().regex(/^\d{1,10}$/, "Enter an amount.").transform(Number).optional(),
  })
  .strict();

const FormContextSchema = z
  .object({
    ownerId: z.uuid(),
    ownerName: z.string(),
    balancePaisa: z.number().int(),
    advanceLimitPaisa: z.number().int().nullable(),
    advanceUsedPaisa: z.number().int(),
    activeLoans: z.array(z.object({ id: z.uuid(), number: z.number().int(), outstandingPaisa: z.number().int() })),
    openMonth: MonthKeySchema.nullable(),
    grantPerTenPctPaisa: z.number().int().nullable(),
    pendingNumbers: z.array(z.string()),
  })
  .meta({ id: "RequestFormContext" });

registry.registerPath({
  method: "get",
  path: "/requests/form-context",
  tags: [REQUESTS_TAG],
  summary: "Live hints for the Request money form",
  description:
    "Permission `request.create`. The requester's balance, advance limit and use, active loans, latest open month, pending requests and — with `amountPaisa` — the grant cost per 10 % share. `ownerId` of another owner needs `request.record` (F2, G11, G12).",
  security: cookieAuthRead,
  request: { query: FormContextQuerySchema },
  responses: {
    200: jsonResponse("Context", apiSuccessSchema("RequestFormContextResponse", FormContextSchema)),
    ...readErrors,
    403: jsonResponse("FORBIDDEN / NO_OWNER_PROFILE", ApiErrorSchema),
  },
});
