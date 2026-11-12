import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { moneyWorld } from "../../helpers/factory";

async function world() {
  const w = await moneyWorld();
  const notice = await prisma.notice.create({ data: { propertyId: w.property.id, title: "Water tank cleaning", body: "Supply off 10–2.", createdById: w.admin.id } });
  const complaint = await prisma.complaint.create({
    data: { propertyId: w.property.id, title: "Bill looks high", body: "In March it was ৳4,600.", createdById: w.owner.id },
  });
  const comment = await prisma.complaintComment.create({ data: { complaintId: complaint.id, authorId: w.admin.id, body: "Checking." } });
  return { ...w, notice, complaint, comment };
}

describe("notices & complaints schema guards (design D1)", () => {
  it("never deletes notices, complaints or comments", async () => {
    const w = await world();
    await expect(prisma.notice.delete({ where: { id: w.notice.id } })).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.complaintComment.delete({ where: { id: w.comment.id } })).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.complaint.delete({ where: { id: w.complaint.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("defaults a complaint to Open + Everyone and a notice to Normal, unpinned", async () => {
    const w = await world();
    expect(w.complaint).toMatchObject({ status: "OPEN", visibility: "ALL", reopened: false, aboutAdmin: false, linkType: null });
    expect(w.notice).toMatchObject({ priority: "NORMAL", pinned: false, pinUntil: null, archivedAt: null });
  });

  it("refuses a link type without an id (and a fix type without an id)", async () => {
    const w = await world();
    await expect(prisma.complaint.update({ where: { id: w.complaint.id }, data: { linkType: "ENTRY" } })).rejects.toThrow(/complaints_link_pair/);
    await expect(prisma.complaint.update({ where: { id: w.complaint.id }, data: { fixType: "ENTRY" } })).rejects.toThrow(/complaints_fix_pair/);
  });

  it("keeps one read per member and notice", async () => {
    const w = await world();
    await prisma.noticeRead.create({ data: { noticeId: w.notice.id, userId: w.owner.id } });
    await expect(prisma.noticeRead.create({ data: { noticeId: w.notice.id, userId: w.owner.id } })).rejects.toThrow();
  });

  it("turns notices & complaints emails on for every user by default", async () => {
    const w = await world();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } })).emailNotices).toBe(true);
  });
});
