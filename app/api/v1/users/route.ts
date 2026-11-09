import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { countActiveSuperAdmins, createInvitedUser, listUsers } from "@/lib/users/admin-service";
import { toPublicUser } from "@/lib/users/dto";
import { CreateUserBodySchema, ListUsersQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListUsersQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const [page, activeSuperAdminCount] = await Promise.all([listUsers(query.data), countActiveSuperAdmins()]);
    return ok({ items: page.items.map(toPublicUser), nextCursor: page.nextCursor, activeSuperAdminCount }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "user.list", strict: true },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateUserBodySchema);
    if (!body.ok) return body.response;
    const result = await createInvitedUser(body.data, { id: auth.userId, ...requestMeta(req) });
    if (!result.ok) return apiError(result.code);
    return ok({ user: toPublicUser(result.user) }, { status: 201 });
  },
  { permission: "user.create", strict: true },
);
