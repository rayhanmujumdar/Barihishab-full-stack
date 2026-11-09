import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { Suspense } from "react";
import { MeScreen } from "@/components/me/MeScreen";
import { requireViewer } from "@/lib/auth/server";
import { listActiveSessions } from "@/lib/auth/session-service";
import { describeUserAgent } from "@/lib/auth/user-agent";
import { getLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { toPublicUser } from "@/lib/users/dto";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.profile") };
}

export default function MePage() {
  return (
    <Suspense fallback={null}>
      <Me />
    </Suspense>
  );
}

async function Me() {
  const viewer = await requireViewer();
  const locale = await getLocale();
  const [user, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: viewer.id }, include: { roles: true } }),
    listActiveSessions(viewer.id),
  ]);
  return (
    <MeScreen
      locale={locale}
      profile={toPublicUser(user)}
      permissions={viewer.permissions}
      sessions={sessions.map((s) => ({
        id: s.id,
        ...describeUserAgent(s.userAgent),
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        current: s.id === viewer.sessionId,
      }))}
    />
  );
}
