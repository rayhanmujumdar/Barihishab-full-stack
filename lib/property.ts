// v1 manages exactly one house (Auth PRD RBAC-06): every property-scoped
// query filters by this id so a second property later is a data change only.
import { prisma } from "@/lib/prisma";

export async function currentPropertyId(): Promise<string> {
  const property = await prisma.property.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!property) throw new Error("No property exists — run `pnpm db:seed` first");
  return property.id;
}
