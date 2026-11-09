import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { MAX_AMOUNT_PAISA } from "@/lib/money";
import { LedgerEntrySchema } from "../../../payouts/schema";
import { registry } from "../../../registry";

export const SignedAmountSchema = z
  .number({ error: "Enter an amount." })
  .int("Enter an amount.")
  .min(-MAX_AMOUNT_PAISA, "At most ৳1 crore per entry.")
  .max(MAX_AMOUNT_PAISA, "At most ৳1 crore per entry.")
  .refine((v) => v !== 0, "Enter an amount.")
  .meta({ description: "Signed integer paisa: + owed by the house, − advance outstanding", example: 2989440 });

export const OpeningBodySchema = z
  .object({ amountPaisa: SignedAmountSchema, note: z.string().trim().max(200, "At most 200 characters").nullable().optional() })
  .strict()
  .meta({ id: "OpeningBody" });

registry.registerPath({
  method: "put",
  path: "/owners/{id}/opening",
  tags: ["Owners"],
  summary: "Set an owner's opening balance (setup only)",
  description: "Permission `owner.manage`. Creates or edits the single OPENING entry (earliest period). Locked with `409 OPENING_LOCKED` once any month is closed.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: OpeningBodySchema } } } },
  responses: {
    200: jsonResponse("Saved", apiSuccessSchema("OpeningResponse", z.object({ entry: LedgerEntrySchema, balancePaisa: z.number().int() }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("OPENING_LOCKED", ApiErrorSchema),
  },
});
