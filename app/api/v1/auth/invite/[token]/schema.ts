import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../../../registry";

export const InviteInfoSchema = z
  .object({
    firstName: z.string().meta({ example: "Karim" }),
    username: z.string().meta({ example: "karim" }),
    invitedBy: z.string().meta({ example: "Rayhan Mojumdar" }),
    expiresAt: z.iso.datetime(),
    locale: z.enum(["bn", "en"]),
  })
  .meta({ id: "InviteInfo" });

registry.registerPath({
  method: "get",
  path: "/auth/invite/{token}",
  tags: ["Auth"],
  summary: "Check an invite link",
  request: { params: z.object({ token: z.string() }) },
  responses: {
    200: jsonResponse("Valid invite", apiSuccessSchema("InviteInfoResponse", InviteInfoSchema)),
    410: jsonResponse("TOKEN_EXPIRED (details.invitedBy when known) or TOKEN_USED", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED", ApiErrorSchema),
  },
});
