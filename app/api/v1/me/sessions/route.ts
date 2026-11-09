import { connection } from "next/server";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { listActiveSessions } from "@/lib/auth/session-service";
import { describeUserAgent } from "@/lib/auth/user-agent";

export const GET = withAuth(
  async (_req, { auth }) => {
    await connection();
    const sessions = await listActiveSessions(auth.userId);
    return ok(
      sessions.map((s) => ({
        id: s.id,
        ...describeUserAgent(s.userAgent),
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        current: s.id === auth.sessionId,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { permission: "session.manage.self", strict: true },
);
