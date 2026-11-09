// The Owners PRD §2.2 sample house, for Owners API tests (clock: Oct 2026).
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createOwner, createShareSet, createUser, moneyWorld } from "./factory";
import { loginAs } from "./http";

export async function ownersWorld() {
  const w = await moneyWorld();
  await prisma.user.update({ where: { id: w.admin.id }, data: { firstName: "Rayhan", lastName: "Ahmed", houseResponsibility: "Bookkeeper · electricity & gas bills" } });
  await prisma.user.update({ where: { id: w.owner.id }, data: { firstName: "Nasrin", lastName: "Ahmed", houseResponsibility: "Elder · signs bank cheques", phone: "01711000000" } });
  const invited = await createUser({ roles: ["OWNER"], status: "INVITED", password: null, firstName: "Sabrina" });

  const p = w.property.id;
  const nasrin = await createOwner(p, { userId: w.owner.id, displayName: "Nasrin Ahmed", initials: "NA", sortOrder: 1 });
  const rayhan = await createOwner(p, { userId: w.admin.id, displayName: "Rayhan Ahmed", initials: "RA", sortOrder: 2 });
  const tanvir = await createOwner(p, { displayName: "Tanvir Ahmed", initials: "TA", sortOrder: 3 });
  const farzana = await createOwner(p, { displayName: "Farzana Haque", initials: "FH", sortOrder: 4 });
  const sabrina = await createOwner(p, { userId: invited.id, displayName: "Sabrina Ahmed", initials: "SA", sortOrder: 5 });

  const jan = await createShareSet(p, w.admin.id, "2026-01", { [nasrin.id]: 50, [rayhan.id]: 25, [tanvir.id]: 15, [farzana.id]: 10 }, { reason: "Initial shares" });
  const jun = await createShareSet(
    p,
    w.admin.id,
    "2026-06",
    { [nasrin.id]: 40, [rayhan.id]: 25, [tanvir.id]: 15, [farzana.id]: 10, [sabrina.id]: 10 },
    { reason: "Gifted 10 units to Sabrina, deed 20 May 2026" },
  );

  const entry = (ownerId: string, type: Parameters<typeof createLedgerEntry>[0]["type"], amountPaisa: number, extra: Partial<Parameters<typeof createLedgerEntry>[0]> = {}) =>
    createLedgerEntry({ propertyId: p, ownerId, periodId: w.oct.id, createdById: w.admin.id, type, amountPaisa, ...extra });
  await entry(tanvir.id, "OPENING", 805585);
  await entry(farzana.id, "OPENING", 870390);
  await entry(nasrin.id, "ADVANCE", -500000, { fundAccountId: w.cash.id, entryDate: "2026-10-12" });
  await createLoan({ propertyId: p, ownerId: tanvir.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 3500000 });

  return {
    ...w,
    invited,
    owners: { nasrin, rayhan, tanvir, farzana, sabrina },
    sets: { jan, jun },
    entry,
    adminLogin: await loginAs(w.admin),
    ownerLogin: await loginAs(w.owner),
  };
}
