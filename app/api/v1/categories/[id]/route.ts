import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { updateCategory } from "@/lib/master-data/category-service";
import { currentPropertyId } from "@/lib/property";
import { PatchCategoryBodySchema } from "../schema";

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchCategoryBodySchema);
    if (!body.ok) return body.response;
    const r = await updateCategory(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ category: r.category }) : failResponse(r);
  },
  { permission: "category.manage" },
);
