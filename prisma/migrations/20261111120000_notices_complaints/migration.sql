-- CreateEnum
CREATE TYPE "NoticePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ComplaintVisibility" AS ENUM ('ALL', 'ADMIN');

-- CreateEnum
CREATE TYPE "ComplaintLinkType" AS ENUM ('ENTRY', 'MONTH', 'LEDGER', 'LOAN', 'REQUEST', 'SHARE_SET');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailTemplate" ADD VALUE 'NOTICE';
ALTER TYPE "EmailTemplate" ADD VALUE 'COMPLAINT_UPDATE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_notices" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "NoticePriority" NOT NULL DEFAULT 'NORMAL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "pin_until" DATE,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" UUID,
    "last_reminded_on" DATE,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "notice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("notice_id","user_id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "ComplaintVisibility" NOT NULL DEFAULT 'ALL',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "link_type" "ComplaintLinkType",
    "link_id" UUID,
    "period_id" UUID,
    "about_admin" BOOLEAN NOT NULL DEFAULT false,
    "reopened" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "fix_type" "ComplaintLinkType",
    "fix_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_comments" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "hidden_at" TIMESTAMPTZ(6),
    "hidden_by" UUID,
    "hidden_reason" TEXT,

    CONSTRAINT "complaint_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_views" (
    "complaint_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_views_pkey" PRIMARY KEY ("complaint_id","user_id")
);

-- CreateIndex
CREATE INDEX "notices_property_id_archived_at_published_at_idx" ON "notices"("property_id", "archived_at", "published_at" DESC);

-- CreateIndex
CREATE INDEX "notice_reads_user_id_idx" ON "notice_reads"("user_id");

-- CreateIndex
CREATE INDEX "complaints_property_id_status_idx" ON "complaints"("property_id", "status");

-- CreateIndex
CREATE INDEX "complaints_property_id_period_id_idx" ON "complaints"("property_id", "period_id");

-- CreateIndex
CREATE INDEX "complaints_link_type_link_id_idx" ON "complaints"("link_type", "link_id");

-- CreateIndex
CREATE INDEX "complaint_comments_complaint_id_created_at_idx" ON "complaint_comments"("complaint_id", "created_at");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_views" ADD CONSTRAINT "complaint_views_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_views" ADD CONSTRAINT "complaint_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Hand-written (design D1) ───
-- A link and a fix are a (type, id) pair: both set or both empty.
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_link_pair" CHECK (("link_type" IS NULL) = ("link_id" IS NULL));
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_fix_pair" CHECK (("fix_type" IS NULL) = ("fix_id" IS NULL));
ALTER TABLE "notices" ADD CONSTRAINT "notices_title_len" CHECK (char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_title_len" CHECK (char_length("title") BETWEEN 1 AND 120);

-- Notices, complaints and comments are never deleted (Rules 5, 12): archive / withdraw / hide instead.
CREATE TRIGGER "notices_no_delete" BEFORE DELETE ON "notices"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
REVOKE DELETE ON "notices" FROM PUBLIC;
CREATE TRIGGER "complaints_no_delete" BEFORE DELETE ON "complaints"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
REVOKE DELETE ON "complaints" FROM PUBLIC;
CREATE TRIGGER "complaint_comments_no_delete" BEFORE DELETE ON "complaint_comments"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
REVOKE DELETE ON "complaint_comments" FROM PUBLIC;
