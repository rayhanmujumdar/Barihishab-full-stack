// Not a route: builds the v1 OpenAPI document from everything registered.
// Adding an endpoint? Create app/api/v1/<module>/schema.ts that calls
// registry.registerPath(...), then import it below — or it won't appear in Swagger.
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { API_PREFIX } from "@/lib/api/constants";
import { registry } from "./registry";

import "./health/schema";
import "./health/db/schema";
import "./auth/login/schema";
import "./auth/refresh/schema";
import "./auth/session/schema";
import "./auth/logout/schema";
import "./auth/logout-all/schema";
import "./auth/forgot/schema";
import "./auth/reset/schema";
import "./auth/reset/[token]/schema";
import "./auth/invite/[token]/schema";
import "./auth/accept-invite/schema";
import "./me/schema";
import "./me/password/schema";
import "./me/sessions/schema";
import "./users/schema";
import "./users/[id]/schema";
import "./audit/schema";
import "./periods/schema";
import "./units/schema";
import "./fund-accounts/schema";
import "./categories/schema";
import "./transactions/schema";
import "./transactions/summary/schema";
import "./transactions/vendors/schema";
import "./transactions/adjustments/schema";
import "./transactions/generate-rent/schema";
import "./transactions/[id]/schema";
import "./transactions/[id]/void/schema";
import "./transactions/[id]/attachments/schema";
import "./attachments/presign/schema";
import "./avatars/presign/schema";
import "./attachments/[id]/schema";
import "./attachments/[id]/file/schema";
import "./owners/schema";
import "./owners/shares/schema";
import "./owners/[id]/schema";
import "./owners/[id]/opening/schema";
import "./owners/[id]/statement/schema";
import "./payouts/schema";
import "./advances/schema";
import "./advances/by-owner/schema";
import "./settings/advance-limit/schema";
import "./adjustments/schema";
import "./ledger/[id]/void/schema";
import "./loans/schema";
import "./loans/[id]/schema";
import "./loans/[id]/repayments/schema";
import "./loans/[id]/repayments/[repaymentId]/void/schema";
import "./loans/[id]/cancel/schema";
import "./loans/[id]/write-off/schema";
import "./settings/reserve/schema";
import "./distribution/schema";
import "./dashboard/schema";
import "./email/outbox/status/schema";
import "./requests/schema";
import "./requests/form-context/schema";
import "./requests/seen/schema";
import "./requests/[id]/schema";
import "./requests/[id]/cancel/schema";
import "./requests/[id]/approve/schema";
import "./requests/[id]/reject/schema";
import "./requests/[id]/withdraw/schema";
import "./requests/[id]/disburse/schema";
import "./periods/[month]/reserve/schema";
import "./periods/[month]/close-preview/schema";
import "./periods/[month]/close/schema";
import "./periods/[month]/reopen/schema";
import "./reports/monthly/schema";
import "./reports/yearly/schema";
import "./reports/rent-roll/schema";
import "./reports/expenses/schema";
import "./reports/funds/schema";
import "./notices/schema";
import "./notices/[id]/schema";
import "./notices/[id]/archive/schema";
import "./notices/[id]/read/schema";
import "./notices/[id]/reads/schema";
import "./notices/[id]/remind/schema";
import "./notices/read-all/schema";
import "./complaints/schema";
import "./complaints/[id]/schema";
import "./complaints/[id]/status/schema";
import "./complaints/[id]/withdraw/schema";
import "./complaints/[id]/reopen/schema";
import "./complaints/[id]/publish/schema";
import "./complaints/[id]/seen/schema";
import "./complaints/[id]/comments/schema";
import "./complaints/[id]/comments/[commentId]/schema";
import "./complaints/[id]/comments/[commentId]/hide/schema";
import "./complaints/links/schema";
import "./complaints/links/[type]/[id]/schema";
import "./complaints/questioned/schema";

let cached: ReturnType<OpenApiGeneratorV31["generateDocument"]> | undefined;

export function getOpenApiDocument() {
  cached ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Barihishab API",
      version: "1.0.0",
      description: `All endpoints are served under \`${API_PREFIX}\`.`,
    },
    servers: [{ url: API_PREFIX }],
  });
  return cached;
}
