import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { deriveCsrfToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";
import { sessionPayload } from "@/lib/users/dto";

export const GET = withAuth(
  async (_req, { auth }) => {
    await connection();
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, include: { roles: true } });
    if (!user) return apiError("UNAUTHENTICATED");
    return ok({ ...sessionPayload(user), csrfToken: deriveCsrfToken(auth.sessionId) }, { headers: { "Cache-Control": "no-store" } });
  },
  { strict: true },
);
