import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { UsersManager } from "@/components/users/UsersManager";
import { requirePagePermission } from "@/lib/auth/server";
import { getLocale } from "@/lib/i18n/server";
import { countActiveSuperAdmins, listUsers } from "@/lib/users/admin-service";
import { toPublicUser } from "@/lib/users/dto";
import { UsersSkeleton } from "@/components/skeletons/pages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.users") };
}

export default async function UsersPage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<UsersSkeleton locale={locale} />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const locale = await getLocale();
  // RBAC-01/04: the page loader checks the permission itself.
  const viewer = await requirePagePermission("user.list");
  if (!viewer) return <Forbidden locale={locale} />;
  const [page, activeSuperAdminCount] = await Promise.all([listUsers({ limit: 50 }), countActiveSuperAdmins()]);
  return (
    <UsersManager
      locale={locale}
      viewerId={viewer.id}
      initial={{ items: page.items.map(toPublicUser), nextCursor: page.nextCursor, activeSuperAdminCount }}
    />
  );
}
