// "Active members" (Notices & Complaints PRD §3, N2, N4): ACTIVE users holding
// Super Admin or Owner for this house. Invited and deactivated users never
// count toward "{n} of {m} read" and are never emailed.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type Member = { id: string; email: string; locale: "bn" | "en"; name: string; isAdmin: boolean; emailNotices: boolean };

const ROLE_HERE = (propertyId: string) => ({ OR: [{ propertyId: null }, { propertyId }] });

export function activeMemberWhere(propertyId: string): Prisma.UserWhereInput {
  return { status: "ACTIVE", roles: { some: { role: { in: ["SUPER_ADMIN", "OWNER"] }, ...ROLE_HERE(propertyId) } } };
}

/** Every active member, Super Admins flagged. */
export async function activeMembers(db: Db, propertyId: string): Promise<Member[]> {
  const rows = await db.user.findMany({
    where: activeMemberWhere(propertyId),
    select: { id: true, email: true, locale: true, firstName: true, lastName: true, name: true, username: true, emailNotices: true, roles: { select: { role: true, propertyId: true } } },
    orderBy: [{ firstName: "asc" }, { username: "asc" }],
  });
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    locale: u.locale,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || u.username,
    isAdmin: u.roles.some((r) => r.role === "SUPER_ADMIN" && (r.propertyId === null || r.propertyId === propertyId)),
    emailNotices: u.emailNotices,
  }));
}
