import { connection } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { AuditQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(AuditQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const { category, actorId, entityId, cursor, limit } = query.data;

    const where: Prisma.AuditLogWhereInput = {
      ...(category === "auth" ? { OR: [{ action: { startsWith: "auth." } }, { action: { startsWith: "user." } }] } : {}),
      ...(actorId ? { actorId } : {}),
      ...(entityId ? { entityId } : {}),
      ...(cursor ? { id: { lt: BigInt(cursor) } } : {}),
    };
    const rows = await prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const page = rows.slice(0, limit);
    const actorIds = [...new Set(page.map((r) => r.actorId).filter((v): v is string => !!v))];
    const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } } }) : [];
    const names = new Map(actors.map((a) => [a.id, displayName(a)]));

    return ok(
      {
        items: page.map((r) => ({
          id: r.id.toString(),
          actorId: r.actorId,
          actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          before: r.before,
          after: r.after,
          reason: r.reason,
          ip: r.ip,
          userAgent: r.userAgent,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: rows.length > limit ? page[page.length - 1].id.toString() : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { permission: "audit.view.all", strict: true },
);
