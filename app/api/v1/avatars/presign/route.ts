// Profile photo upload URL (add-profile-photo D3). Owners may upload their own
// photo; the Super Admin uploads one for a new or edited user.
import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { presignAvatarUpload } from "@/lib/attachments/avatar-service";
import { withAuth } from "@/lib/auth/guard";
import { limitBy } from "@/lib/auth/rate-guard";
import { LIMITS } from "@/lib/auth/rate-limit";
import { requestMeta } from "@/lib/auth/request-meta";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { AvatarPresignBodySchema } from "./schema";

export const POST = withAuth(
  async (req, { auth }) => {
    if (!(["profile.update.self", "user.create", "user.update"] as const).some((p) => can(auth, p))) return apiError("FORBIDDEN");
    const limited = await limitBy(LIMITS.presignPerUser, auth.userId);
    if (limited) return limited;
    const body = await readJson(req, AvatarPresignBodySchema);
    if (!body.ok) return body.response;
    const r = await presignAvatarUpload(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    if (!r.ok) return failResponse(r);
    return ok({ avatarId: r.avatarId, uploadUrl: r.uploadUrl, headers: r.headers, expiresAt: r.expiresAt }, { status: 201 });
  },
  { strict: true },
);
