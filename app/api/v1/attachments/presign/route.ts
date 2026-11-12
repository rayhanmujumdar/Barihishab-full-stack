import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { presignUpload } from "@/lib/attachments/attachment-service";
import { withAuth } from "@/lib/auth/guard";
import { limitBy } from "@/lib/auth/rate-guard";
import { LIMITS } from "@/lib/auth/rate-limit";
import { requestMeta } from "@/lib/auth/request-meta";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { PresignBodySchema } from "./schema";

export const POST = withAuth(
  async (req, { auth }) => {
    // Entry bills, owner payout/advance receipts (Owners PRD F11), request files (Requests PRD F15),
    // notice files and complaint/comment evidence (Notices & Complaints PRD G3, G8).
    if (!(["transaction.create", "payout.create", "advance.create", "request.create", "notice.manage", "complaint.create"] as const).some((p) => can(auth, p))) return apiError("FORBIDDEN");
    const limited = await limitBy(LIMITS.presignPerUser, auth.userId);
    if (limited) return limited;
    const body = await readJson(req, PresignBodySchema);
    if (!body.ok) return body.response;
    const r = await presignUpload(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    if (!r.ok) return failResponse(r);
    return ok({ attachmentId: r.attachmentId, uploadUrl: r.uploadUrl, headers: r.headers, expiresAt: r.expiresAt }, { status: 201 });
  },
  { strict: true },
);
