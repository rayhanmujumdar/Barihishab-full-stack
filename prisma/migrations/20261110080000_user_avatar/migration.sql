-- Profile photo (add-profile-photo D2): pointer from a user to the attachments row
-- (entity_type 'user_avatar') holding their current photo. Additive, no backfill.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_attachment_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_attachment_id_key" ON "users"("avatar_attachment_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_attachment_id_fkey" FOREIGN KEY ("avatar_attachment_id") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

