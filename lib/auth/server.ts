// Server-component side of auth (RBAC-01/03/04 for page loaders). Reads
// cookies, so call these only inside a <Suspense> boundary (cacheComponents).
import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { can, permissionsFor, type Permission, type Role } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { attachmentFileUrl } from "@/lib/attachments/file-url";
import { rolesOf } from "@/lib/users/dto";
import { COOKIE } from "./cookies";
import { getLocale } from "@/lib/i18n/server";
import { localePath, stripLocale } from "@/lib/i18n/paths";
import { safeNext } from "./safe-redirect";
import { findActiveSession } from "./session-service";
import { verifyAccessToken } from "./tokens";

export type Viewer = {
  id: string;
  sessionId: string;
  name: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  /** Same-origin profile photo URL, or null (add-profile-photo). */
  avatarUrl: string | null;
  locale: "bn" | "en";
  roles: Role[];
  permissions: Permission[];
};

/** The logged-in user, strictly validated (live session, ACTIVE, current token_version). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(COOKIE.access)?.value;
  // Token/session expiry compares against the clock: request-time only.
  await connection();
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const [session, user] = await Promise.all([
    findActiveSession(claims.sid),
    prisma.user.findUnique({ where: { id: claims.sub }, include: { roles: true } }),
  ]);
  if (!session || session.userId !== claims.sub || !user || user.status !== "ACTIVE" || user.tokenVersion !== claims.ver) return null;
  const roles = rolesOf(user);
  return {
    id: user.id,
    sessionId: session.id,
    name: user.name,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarAttachmentId ? attachmentFileUrl(user.avatarAttachmentId) : null,
    locale: user.locale,
    roles,
    permissions: permissionsFor(roles),
  };
});

async function currentPath(): Promise<string> {
  return safeNext((await headers()).get("x-pathname"));
}

/** RBAC-03: no valid session → refresh (if possible) or /login?next=. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer) return viewer;
  const next = await currentPath();
  const jar = await cookies();
  if (jar.get(COOKIE.refresh)?.value && jar.get(COOKIE.access)?.value) {
    // Access token still parses but its session/user changed: try one refresh.
    redirect(`/api/v1/auth/refresh?next=${encodeURIComponent(next)}`);
  }
  const login = localePath(await getLocale(), "/login");
  redirect(stripLocale(next) === "/" ? login : `${login}?next=${encodeURIComponent(next)}`);
}

/** RBAC-04: returns the viewer when allowed, or null so the page renders its 403 view. */
export async function requirePagePermission(permission: Permission): Promise<Viewer | null> {
  const viewer = await requireViewer();
  return can(viewer, permission) ? viewer : null;
}
