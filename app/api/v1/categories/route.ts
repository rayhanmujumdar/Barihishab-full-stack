import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { createCategory, listCategories } from "@/lib/master-data/category-service";
import { currentPropertyId } from "@/lib/property";
import { CreateCategoryBodySchema, ListCategoriesQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListCategoriesQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok({ items: await listCategories(await currentPropertyId(), query.data) }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateCategoryBodySchema);
    if (!body.ok) return body.response;
    const r = await createCategory(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ category: r.category }, { status: 201 }) : failResponse(r);
  },
  { permission: "category.manage" },
);
