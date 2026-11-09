-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('OPENING', 'ENTITLEMENT', 'PAYOUT', 'ADVANCE', 'LOAN_DEDUCTION', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('CASH', 'BANK', 'BKASH', 'NAGAD');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'REPAID', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_sets" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_at" TIMESTAMPTZ(6),

    CONSTRAINT "share_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_set_items" (
    "share_set_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "units" INTEGER NOT NULL,

    CONSTRAINT "share_set_items_pkey" PRIMARY KEY ("share_set_id","owner_id")
);

-- CreateTable
CREATE TABLE "owner_ledger_entries" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount_paisa" BIGINT NOT NULL,
    "entry_date" DATE NOT NULL,
    "fund_account_id" UUID,
    "method" "PayMethod",
    "reference_no" TEXT,
    "note" TEXT,
    "reference_period_id" UUID,
    "reverses_id" UUID,
    "is_self" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,

    CONSTRAINT "owner_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "principal_paisa" BIGINT NOT NULL,
    "disbursed_on" DATE NOT NULL,
    "fund_account_id" UUID NOT NULL,
    "method" "PayMethod" NOT NULL,
    "reference_no" TEXT,
    "reason" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "payout_entry_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_property_id_user_id_key" ON "owners"("property_id", "user_id");

-- CreateIndex
CREATE INDEX "share_sets_property_id_effective_from_idx" ON "share_sets"("property_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "owner_ledger_entries_reverses_id_key" ON "owner_ledger_entries"("reverses_id");

-- CreateIndex
CREATE INDEX "owner_ledger_entries_owner_id_period_id_idx" ON "owner_ledger_entries"("owner_id", "period_id");

-- CreateIndex
CREATE INDEX "owner_ledger_entries_fund_account_id_idx" ON "owner_ledger_entries"("fund_account_id");

-- CreateIndex
CREATE INDEX "loans_owner_id_status_idx" ON "loans"("owner_id", "status");

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_sets" ADD CONSTRAINT "share_sets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_sets" ADD CONSTRAINT "share_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_set_items" ADD CONSTRAINT "share_set_items_share_set_id_fkey" FOREIGN KEY ("share_set_id") REFERENCES "share_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_set_items" ADD CONSTRAINT "share_set_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_reference_period_id_fkey" FOREIGN KEY ("reference_period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_fund_account_id_fkey" FOREIGN KEY ("fund_account_id") REFERENCES "fund_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "owner_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "owner_ledger_entries_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_fund_account_id_fkey" FOREIGN KEY ("fund_account_id") REFERENCES "fund_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_payout_entry_id_fkey" FOREIGN KEY ("payout_entry_id") REFERENCES "owner_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written (design D1/D2) — Prisma can't express these ───

-- Ledger amounts: signed paisa, never 0, at most ৳1 crore per entry.
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_amount_range"
  CHECK (amount_paisa <> 0 AND abs(amount_paisa) <= 1000000000);
-- Cash out of the House Fund: negative and always from a fund account.
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_cash_out_sign"
  CHECK (type NOT IN ('PAYOUT', 'ADVANCE') OR (amount_paisa < 0 AND fund_account_id IS NOT NULL));
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_entitlement_sign"
  CHECK (type <> 'ENTITLEMENT' OR amount_paisa > 0);
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_reversal_link"
  CHECK (type <> 'REVERSAL' OR reverses_id IS NOT NULL);
ALTER TABLE "owner_ledger_entries" ADD CONSTRAINT "ole_void_fields"
  CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
      OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL));

ALTER TABLE "share_set_items" ADD CONSTRAINT "ssi_units_range" CHECK (units >= 0 AND units <= 1000000);
ALTER TABLE "loans" ADD CONSTRAINT "loans_principal_range" CHECK (principal_paisa > 0 AND principal_paisa <= 1000000000);

-- One Opening entry per owner (F10); one active share set per month (Rule 6).
CREATE UNIQUE INDEX "ole_one_opening" ON "owner_ledger_entries" ("owner_id") WHERE type = 'OPENING';
CREATE UNIQUE INDEX "share_sets_one_active_month" ON "share_sets" ("property_id", "effective_from") WHERE replaced_at IS NULL;

-- Closed months are frozen, except marking an entry void: its money effect
-- is a REVERSAL in the open month; only the void columns change here (D2).
CREATE OR REPLACE FUNCTION block_closed_period_ledger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
     AND (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason')
       = (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason') THEN
    RETURN NEW;
  END IF;
  IF (SELECT status FROM periods WHERE id = NEW.period_id) = 'CLOSED' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.period_id <> NEW.period_id
     AND (SELECT status FROM periods WHERE id = OLD.period_id) = 'CLOSED' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "ole_closed_guard" BEFORE INSERT OR UPDATE ON "owner_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION block_closed_period_ledger();

-- Owners and their money history are never deleted (Rules 10, 18).
CREATE TRIGGER "owners_no_delete" BEFORE DELETE ON "owners"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER "share_sets_no_delete" BEFORE DELETE ON "share_sets"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER "share_set_items_no_delete" BEFORE DELETE ON "share_set_items"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER "ole_no_delete" BEFORE DELETE ON "owner_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER "loans_no_delete" BEFORE DELETE ON "loans"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();

REVOKE DELETE ON "owners", "share_sets", "share_set_items", "owner_ledger_entries", "loans" FROM PUBLIC;
