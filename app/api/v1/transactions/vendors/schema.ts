import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const VendorQuerySchema = z.object({ q: z.string().trim().max(100).default("") });

registry.registerPath({
  method: "get",
  path: "/transactions/vendors",
  tags: ["Income & expenses"],
  summary: "Vendor autocomplete from previous expenses",
  description: "Permission `transaction.create`. Up to 10, prefix match, most used first.",
  security: cookieAuthRead,
  request: { query: VendorQuerySchema },
  responses: { 200: jsonResponse("Vendors", apiSuccessSchema("VendorListResponse", z.object({ items: z.array(z.string()) }))), ...readErrors },
});
