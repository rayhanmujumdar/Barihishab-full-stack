-- AlterTable
ALTER TABLE "periods" ADD COLUMN     "reopen_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserve_override_paisa" BIGINT,
ADD COLUMN     "reserve_override_reason" TEXT,
ADD COLUMN     "snapshot" JSONB;

-- AlterTable
ALTER TABLE "owner_ledger_entries" ADD COLUMN     "loan_id" UUID;

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "installment_paisa" BIGINT;

-- CreateTable
CREATE TABLE "period_reopens" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reopened_by" UUID NOT NULL,
    "reopened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot_before" JSONB,

    CONSTRAINT "period_reopens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_reopens_period_id_reopened_at_idx" ON "period_reopens"("period_id", "reopened_at");

-- CreateIndex
CREATE INDEX "owner_ledger_entries_loan_id_idx" ON "owner_ledger_entries"("loan_id");

-- AddForeignKey
ALTER TABLE "period_reopens" ADD CONSTRAINT "period_reopens_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_reopens" ADD CONSTRAINT "period_reopens_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_reopens" ADD CONSTRAINT "period_reopens_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Hand-written (Distribution design D1) — Prisma can't express these ───

ALTER TABLE "periods" ADD CONSTRAINT "periods_reserve_override"
  CHECK ((reserve_override_paisa IS NULL AND reserve_override_reason IS NULL)
      OR (reserve_override_paisa >= 0 AND reserve_override_paisa <= 1000000000 AND reserve_override_reason IS NOT NULL));
ALTER TABLE "periods" ADD CONSTRAINT "periods_reopen_count" CHECK (reopen_count >= 0);

ALTER TABLE "loans" ADD CONSTRAINT "loans_installment_range"
  CHECK (installment_paisa IS NULL OR (installment_paisa > 0 AND installment_paisa <= 1000000000));

-- A loan deduction always names its loan and lowers the balance (F11, §7.5).
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_loan_deduction"
  CHECK (type <> 'LOAN_DEDUCTION' OR (loan_id IS NOT NULL AND amount_paisa < 0));

-- Reopen history is part of the financial record.
CREATE TRIGGER "period_reopens_no_delete" BEFORE DELETE ON "period_reopens"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
REVOKE DELETE ON "period_reopens" FROM PUBLIC;
