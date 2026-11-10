-- CreateEnum
CREATE TYPE "EntryOrigin" AS ENUM ('DIRECT', 'CLOSE', 'PAYOUT_SPLIT');

-- CreateEnum
CREATE TYPE "LoanMovementType" AS ENUM ('CASH_REPAYMENT', 'REVERSAL', 'CANCELLATION', 'WRITE_OFF');

-- AlterEnum
ALTER TYPE "TxnSource" ADD VALUE 'LOAN_WRITE_OFF';

-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "owner_ledger_entries" ADD COLUMN     "origin" "EntryOrigin" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_self" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "origin" "EntryOrigin" NOT NULL DEFAULT 'DIRECT';

-- Backfill (design D2, D3): every existing loan came from a payout split;
-- every existing ENTITLEMENT / LOAN_DEDUCTION was posted by a month close.
UPDATE "loans" l SET "number" = n.rn, "origin" = 'PAYOUT_SPLIT'
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY created_at, id) AS rn FROM "loans") n
WHERE l.id = n.id;
ALTER TABLE "loans" ALTER COLUMN "number" SET NOT NULL;
-- Entitlements live in CLOSED months, so the closed-month guard would refuse
-- this one-off metadata backfill (only the new `origin` column changes; no
-- amounts). Lift it for this statement only.
ALTER TABLE "owner_ledger_entries" DISABLE TRIGGER "ole_closed_guard";
UPDATE "owner_ledger_entries" SET "origin" = 'CLOSE' WHERE type IN ('ENTITLEMENT', 'LOAN_DEDUCTION');
ALTER TABLE "owner_ledger_entries" ENABLE TRIGGER "ole_closed_guard";

-- CreateTable
CREATE TABLE "loan_movements" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "type" "LoanMovementType" NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "movement_date" DATE NOT NULL,
    "fund_account_id" UUID NOT NULL,
    "method" "PayMethod",
    "reference_no" TEXT,
    "note" TEXT,
    "reverses_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,

    CONSTRAINT "loan_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_movements_reverses_id_key" ON "loan_movements"("reverses_id");

-- CreateIndex
CREATE INDEX "loan_movements_loan_id_idx" ON "loan_movements"("loan_id");

-- CreateIndex
CREATE INDEX "loan_movements_fund_account_id_idx" ON "loan_movements"("fund_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "loans_property_id_number_key" ON "loans"("property_id", "number");

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_fund_account_id_fkey" FOREIGN KEY ("fund_account_id") REFERENCES "fund_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "loan_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_movements" ADD CONSTRAINT "loan_movements_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─── Hand-written (Advances & Loans design D1) — Prisma can't express these ───

ALTER TABLE "loans" ADD CONSTRAINT "loans_number_positive" CHECK (number > 0);
ALTER TABLE "loans" ADD CONSTRAINT "loans_origin_kind" CHECK (origin IN ('DIRECT', 'PAYOUT_SPLIT'));

ALTER TABLE "loan_movements" ADD CONSTRAINT "lm_amount_range"
  CHECK (amount_paisa <> 0 AND abs(amount_paisa) <= 1000000000);
-- Repayments, cancellations and write-offs lower the outstanding; reversals raise it and name the original.
ALTER TABLE "loan_movements" ADD CONSTRAINT "lm_sign"
  CHECK ((type = 'REVERSAL' AND amount_paisa > 0 AND reverses_id IS NOT NULL)
      OR (type <> 'REVERSAL' AND amount_paisa < 0 AND reverses_id IS NULL));
ALTER TABLE "loan_movements" ADD CONSTRAINT "lm_void_fields"
  CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
      OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL));

-- Same closed-month freeze as the owner ledger (void marking allowed).
CREATE TRIGGER "lm_closed_guard" BEFORE INSERT OR UPDATE ON "loan_movements"
  FOR EACH ROW EXECUTE FUNCTION block_closed_period_ledger();
CREATE TRIGGER "lm_no_delete" BEFORE DELETE ON "loan_movements"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
REVOKE DELETE ON "loan_movements" FROM PUBLIC;
