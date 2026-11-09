-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_property_id_fkey";

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
