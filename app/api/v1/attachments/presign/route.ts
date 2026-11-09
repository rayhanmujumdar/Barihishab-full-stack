import { readJson } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { presignUpload } from "@/lib/attachments/attachment-service";
import { withAuth } from "@/lib/auth/guard";
import { limitBy } from "@/lib/auth/rate-guard";
import { LIMITS } from "@/lib/auth/rate-limit";
import { requestMeta } from "@/lib/auth/request-meta";
import { currentPropertyId } from "@/lib/property";
import { PresignBodySchema } from "./schema";

export const POST = withAuth(
  async (req, { auth }) => {
    const limited = await limitBy(LIMITS.presignPerUser, auth.userId);
    if (limited) return limited;
    const body = await readJson(req, PresignBodySchema);
    if (!body.ok) return body.response;
    const r = await presignUpload(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    if (!r.ok) return failResponse(r);
    return ok({ attachmentId: r.attachmentId, uploadUrl: r.uploadUrl, headers: r.headers, expiresAt: r.expiresAt }, { status: 201 });
  },
  { permission: "transaction.create" },
);
