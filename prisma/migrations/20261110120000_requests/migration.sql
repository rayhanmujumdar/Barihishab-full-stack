-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('ADVANCE', 'LOAN', 'GRANT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN', 'DISBURSED');

-- AlterEnum
ALTER TYPE "EmailTemplate" ADD VALUE 'REQUEST_UPDATE';

-- AlterEnum
ALTER TYPE "EntryOrigin" ADD VALUE 'REQUEST';

-- AlterEnum
ALTER TYPE "TxnSource" ADD VALUE 'REQUEST_GRANT';

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "house_transactions" ADD COLUMN     "beneficiary_owner_id" UUID,
ADD COLUMN     "request_id" UUID;

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "request_id" UUID;

-- AlterTable
ALTER TABLE "owner_ledger_entries" ADD COLUMN     "request_id" UUID;

-- CreateTable
CREATE TABLE "money_requests" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "owner_id" UUID NOT NULL,
    "type" "RequestType" NOT NULL,
    "amount_requested_paisa" BIGINT NOT NULL,
    "amount_approved_paisa" BIGINT,
    "reason" TEXT NOT NULL,
    "needed_by" DATE NOT NULL,
    "repayment_plan" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "is_self" BOOLEAN NOT NULL DEFAULT false,
    "recorded_on_behalf" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "decision_unseen" BOOLEAN NOT NULL DEFAULT false,
    "disbursed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "money_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "money_requests_property_id_status_idx" ON "money_requests"("property_id", "status");

-- CreateIndex
CREATE INDEX "money_requests_owner_id_idx" ON "money_requests"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "money_requests_property_id_year_number_key" ON "money_requests"("property_id", "year", "number");

-- CreateIndex
CREATE UNIQUE INDEX "house_transactions_request_id_key" ON "house_transactions"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "loans_request_id_key" ON "loans"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_ledger_entries_request_id_key" ON "owner_ledger_entries"("request_id");

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_beneficiary_owner_id_fkey" FOREIGN KEY ("beneficiary_owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "money_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "money_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "money_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─── Hand-written (Requests design D1, D5) — Prisma can't express these ───

ALTER TABLE "money_requests" ADD CONSTRAINT "mr_number_positive" CHECK (number > 0 AND year BETWEEN 2000 AND 2100);
ALTER TABLE "money_requests" ADD CONSTRAINT "mr_requested_range"
  CHECK (amount_requested_paisa >= 100 AND amount_requested_paisa <= 1000000000);
-- Rule 4: ৳1 ≤ approved ≤ requested.
ALTER TABLE "money_requests" ADD CONSTRAINT "mr_approved_range"
  CHECK (amount_approved_paisa IS NULL OR (amount_approved_paisa >= 100 AND amount_approved_paisa <= amount_requested_paisa));
ALTER TABLE "money_requests" ADD CONSTRAINT "mr_reason_length" CHECK (char_length(reason) BETWEEN 10 AND 500);
ALTER TABLE "money_requests" ADD CONSTRAINT "mr_plan_loan_only" CHECK (repayment_plan IS NULL OR type = 'LOAN');

CREATE TRIGGER "money_requests_no_delete" BEFORE DELETE ON "money_requests"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
REVOKE DELETE ON "money_requests" FROM PUBLIC;

-- New enum values can't be used as literals in the transaction that adds them,
-- so these compare as text.
ALTER TABLE "loans" DROP CONSTRAINT "loans_origin_kind";
ALTER TABLE "loans" ADD CONSTRAINT "loans_origin_kind" CHECK (origin::text IN ('DIRECT', 'PAYOUT_SPLIT', 'REQUEST'));
-- A request pays out as an ADVANCE (ledger), a loan, or a REQUEST_GRANT expense — nothing else links to it.
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_request_advance" CHECK (request_id IS NULL OR type = 'ADVANCE');
ALTER TABLE "house_transactions" ADD CONSTRAINT "ht_request_grant"
  CHECK ((request_id IS NULL AND source::text <> 'REQUEST_GRANT') OR (request_id IS NOT NULL AND source::text = 'REQUEST_GRANT' AND kind = 'EXPENSE'));
