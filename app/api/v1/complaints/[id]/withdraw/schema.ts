import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { COMPLAINTS_TAG, ComplaintWriteResponse, LocaleQuery } from "../../../complaints/schema";

registry.registerPath({
  method: "post",
  path: "/complaints/{id}/withdraw",
  tags: [COMPLAINTS_TAG],
  summary: "Withdraw my complaint",
  description: "Permission `complaint.view`; the complainant only, while Open or In review. Final (C5).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), query: LocaleQuery },
  responses: {
    200: jsonResponse("Done", ComplaintWriteResponse("WithdrawComplaintResponse")),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_COMPLAINT_STATUS", ApiErrorSchema),
  },
});
