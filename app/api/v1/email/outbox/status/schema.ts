import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuthRead } from "@/lib/api/schemas";
import { FAILURE_CODES } from "@/lib/email/errors";
import { registry } from "../../../registry";

export const OutboxStatusSchema = z
  .object({
    queued: z.number().int().meta({ description: "Rows waiting to be sent (QUEUED + SENDING)", example: 0 }),
    oldestQueuedAt: z.iso.datetime().nullable(),
    stalled: z.boolean().meta({ description: "A row has been due for 10+ minutes without being sent — the email worker is probably stopped" }),
    failedLast7Days: z.number().int().meta({ description: "FAILED rows created in the last 7 days, excluding inactive recipients", example: 0 }),
    lastFailure: z
      .object({
        at: z.iso.datetime(),
        template: z.enum(["INVITE", "RESET", "PASSWORD_CHANGED", "REQUEST_UPDATE", "NOTICE", "COMPLAINT_UPDATE"]),
        failureCode: z.enum(FAILURE_CODES).nullable(),
      })
      .nullable(),
  })
  .meta({ id: "OutboxStatus" });

export type OutboxStatusDto = z.infer<typeof OutboxStatusSchema>;

registry.registerPath({
  method: "get",
  path: "/email/outbox/status",
  tags: ["Email"],
  summary: "Email outbox health (stalled worker, recent failures)",
  description: "Permission `user.list` (Super Admin). Codes only — never recipient addresses, payloads or provider messages.",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse("Outbox status", apiSuccessSchema("OutboxStatusResponse", OutboxStatusSchema)),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("FORBIDDEN", ApiErrorSchema),
  },
});
