import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProperty, createUser } from "../../helpers/factory";

type Col = { is_nullable: string; data_type: string };
type Fk = { ref_table: string; on_delete: string };

describe("profile photo schema (add-profile-photo D2)", () => {
  it("adds a nullable uuid users.avatar_attachment_id", async () => {
    const cols = await prisma.$queryRaw<Col[]>`
      SELECT is_nullable, data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'avatar_attachment_id'`;
    expect(cols).toEqual([{ is_nullable: "YES", data_type: "uuid" }]);
  });

  it("references attachments with ON DELETE RESTRICT", async () => {
    const fks = await prisma.$queryRaw<Fk[]>`
      SELECT confrelid::regclass::text AS ref_table,
             CASE confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' ELSE confdeltype::text END AS on_delete
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND contype = 'f'
        AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'avatar_attachment_id')]`;
    expect(fks).toEqual([{ ref_table: "attachments", on_delete: "RESTRICT" }]);
  });

  it("lets one photo belong to at most one user", async () => {
    const property = await createProperty();
    const a = await createUser();
    const b = await createUser();
    const att = await prisma.attachment.create({
      data: { propertyId: property.id, entityType: "user_avatar", storageKey: `p/${property.id}/avatar/x-${Date.now()}`, fileName: "me.jpg", mime: "image/jpeg", sizeBytes: 10, uploadedById: a.id },
    });
    await prisma.$executeRaw`UPDATE users SET avatar_attachment_id = ${att.id}::uuid WHERE id = ${a.id}::uuid`;
    await expect(prisma.$executeRaw`UPDATE users SET avatar_attachment_id = ${att.id}::uuid WHERE id = ${b.id}::uuid`).rejects.toThrow();
  });
});
