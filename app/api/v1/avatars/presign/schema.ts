import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { IMAGE_MIME } from "@/lib/files/magic";
import { registry } from "../../registry";

const BAD = "Only JPG, PNG or WebP up to 2 MB.";

export const AvatarPresignBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mime: z.enum(IMAGE_MIME, BAD),
    size: z.number().int().min(1, BAD),
  })
  .strict()
  .meta({ id: "AvatarPresignBody" });

export const AvatarPresignResultSchema = z
  .object({
    avatarId: z.uuid().meta({ description: "Send as `avatarId` to PATCH /me, POST /users or PATCH /users/{id}" }),
    uploadUrl: z.url().meta({ description: "PUT the photo here within 5 minutes with exactly these headers" }),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "AvatarPresignResult" });

registry.registerPath({
  method: "post",
  path: "/avatars/presign",
  tags: ["Me"],
  summary: "Get a 5-minute upload URL for a profile photo",
  description:
    "Any of `profile.update.self`, `user.create`, `user.update`. JPG/PNG/WebP ≤ 2 MB (the app sends a 512 px square JPEG). Shares the 30-per-10-minutes presign limit with bills; unused uploads are removed after 24 h. Use the returned `avatarId` in PATCH /me, POST /users or PATCH /users/{id}.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: AvatarPresignBodySchema } } } },
  responses: {
    201: jsonResponse("Upload URL", apiSuccessSchema("AvatarPresignResponse", AvatarPresignResultSchema)),
    ...writeErrors,
    413: jsonResponse("FILE_TOO_LARGE", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED (30 uploads per 10 minutes per user)", ApiErrorSchema),
  },
});
