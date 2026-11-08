import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../registry";

export const HealthReportSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    apiVersion: z.literal("v1"),
    uptimeSeconds: z.number().meta({ example: 42 }),
    timestamp: z.iso.datetime(),
    checks: z.object({
      database: z.object({
        status: z.enum(["up", "down"]),
        latencyMs: z.number().meta({ example: 3 }),
      }),
    }),
  })
  .meta({ id: "HealthReport" });

export type HealthReport = z.infer<typeof HealthReportSchema>;

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Service health check",
  description:
    "Reports API liveness and database connectivity. Returns 503 with the same report in `error.details` when a dependency is down.",
  responses: {
    200: jsonResponse(
      "All dependencies healthy",
      apiSuccessSchema("HealthResponse", HealthReportSchema),
    ),
    503: jsonResponse("A dependency is down", ApiErrorSchema),
  },
});
