import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../../registry";

export const DB_CHECK_STEPS = ["connect", "write", "read", "delete", "migrations"] as const;

export const DbCheckReportSchema = z
  .object({
    status: z.literal("ok"),
    server: z.string().meta({ example: "PostgreSQL 18.1" }),
    roundTrip: z.object({
      rowId: z.number().int().meta({ example: 17 }),
      wrote: z.boolean(),
      readBack: z.boolean(),
      deleted: z.boolean(),
    }),
    migrations: z.object({
      applied: z.number().int().meta({ example: 1 }),
      latest: z.string().nullable().meta({ example: "20261107103342_init_connection_test" }),
    }),
    latencyMs: z.object({
      connect: z.number(),
      write: z.number(),
      read: z.number(),
      delete: z.number(),
      migrations: z.number(),
      total: z.number(),
    }),
    timestamp: z.iso.datetime(),
  })
  .meta({ id: "DbCheckReport" });

export type DbCheckReport = z.infer<typeof DbCheckReportSchema>;
export type DbCheckStep = (typeof DB_CHECK_STEPS)[number];

registry.registerPath({
  method: "post",
  path: "/health/db",
  tags: ["System"],
  summary: "Deep database check (write → read → delete)",
  description: [
    "Proves the database works end to end: connects, inserts a row into `connection_tests`,",
    "reads it back, deletes it, and reports applied Prisma migrations.",
    "",
    "On failure returns 503 with `error.details.failedStep` naming the step that broke.",
    "Available in development; returns 404 in production unless `API_DIAGNOSTICS_ENABLED=true`.",
  ].join("\n"),
  responses: {
    200: jsonResponse(
      "Database fully working",
      apiSuccessSchema("DbCheckResponse", DbCheckReportSchema),
    ),
    404: jsonResponse("Diagnostics disabled in this environment", ApiErrorSchema),
    503: jsonResponse("A database step failed", ApiErrorSchema),
  },
});
