import { describe, expect, it } from "vitest";
import type { User } from "@/lib/generated/prisma/client";
import { toPublicUser } from "./dto";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Karim",
  email: "karim@example.com",
  emailVerified: false,
  image: null,
  username: "karim",
  displayUsername: "karim",
  firstName: "Karim",
  lastName: null,
  surname: null,
  birthday: null,
  profession: null,
  phone: null,
  whatsapp: null,
  whatsappSameAsPhone: false,
  houseResponsibility: null,
  locale: "en",
  status: "ACTIVE",
  failedLoginCount: 0,
  lockedUntil: null,
  lastLoginAt: null,
  passwordChangedAt: null,
  tokenVersion: 0,
  avatarAttachmentId: null,
  createdById: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  roles: [{ role: "OWNER" as const }],
} satisfies User & { roles: { role: "OWNER" }[] };

describe("toPublicUser avatarUrl (add-profile-photo)", () => {
  it("is the same-origin file URL when a photo is set", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(toPublicUser({ ...base, avatarAttachmentId: id }).avatarUrl).toBe(`/api/v1/attachments/${id}/file`);
  });

  it("is null without a photo", () => {
    expect(toPublicUser(base).avatarUrl).toBeNull();
  });
});
