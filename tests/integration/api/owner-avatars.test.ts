// Owner cards and the distribution board show the linked user's profile photo
// (add-profile-photo follow-up); owners without a login or photo keep initials.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as list from "@/app/api/v1/owners/route";
import * as one from "@/app/api/v1/owners/[id]/route";
import { prisma } from "@/lib/prisma";
import { boardData, byName, distributionWorld } from "../../helpers/distribution";
import { apiRequest, json, params } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

/** Gives a user a linked photo directly (storage is not needed for the read models). */
async function givePhoto(propertyId: string, userId: string) {
  const att = await prisma.attachment.create({
    data: { propertyId, entityType: "user_avatar", entityId: userId, linkedAt: new Date(), storageKey: `p/${propertyId}/avatar/${userId}`, fileName: "me.jpg", mime: "image/jpeg", sizeBytes: 100, uploadedById: userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { avatarAttachmentId: att.id } });
  return `/api/v1/attachments/${att.id}/file`;
}

describe("owner avatars", () => {
  it("lists avatarUrl for owners whose login has a photo, null otherwise", async () => {
    const w = await distributionWorld();
    const url = await givePhoto(w.property.id, w.owner.id); // Nasrin's login
    const { data } = await json(await list.GET(apiRequest("/owners", { login: w.ownerLogin }), params({})));
    const by = Object.fromEntries(data.owners.map((o: { displayName: string; avatarUrl: string | null }) => [o.displayName, o.avatarUrl]));
    expect(by["Nasrin Ahmed"]).toBe(url);
    expect(by["Rayhan Ahmed"]).toBeNull(); // login, no photo
    expect(by["Tanvir Ahmed"]).toBeNull(); // no login
  });

  it("includes avatarUrl on the owner detail", async () => {
    const w = await distributionWorld();
    const url = await givePhoto(w.property.id, w.owner.id);
    const id = w.owners.nasrin.id;
    const { data } = await json(await one.GET(apiRequest(`/owners/${id}`, { login: w.ownerLogin }), params({ id })));
    expect(data.owner.avatarUrl).toBe(url);
  });

  it("includes avatarUrl on distribution board rows", async () => {
    const w = await distributionWorld();
    const url = await givePhoto(w.property.id, w.owner.id);
    const r = byName((await boardData(w.ownerLogin, "2026-10")).rows);
    expect(r.nasrin.avatarUrl).toBe(url);
    expect(r.tanvir.avatarUrl).toBeNull();
  });
});
