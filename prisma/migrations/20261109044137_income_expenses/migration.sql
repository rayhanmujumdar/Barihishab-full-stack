-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('CASH', 'BANK', 'WALLET');

-- CreateEnum
CREATE TYPE "TxnKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TxnSource" AS ENUM ('MANUAL', 'GENERATED_RENT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "periods" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tenant_name" TEXT,
    "default_rent_paisa" BIGINT NOT NULL DEFAULT 0,
    "default_fund_account_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_accounts" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FundType" NOT NULL,
    "opening_balance_paisa" BIGINT NOT NULL DEFAULT 0,
    "opening_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fund_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "kind" "TxnKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_transactions" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "kind" "TxnKind" NOT NULL,
    "category_id" UUID NOT NULL,
    "unit_id" UUID,
    "amount_paisa" BIGINT NOT NULL,
    "txn_date" DATE NOT NULL,
    "fund_account_id" UUID NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "from_reserve" BOOLEAN NOT NULL DEFAULT false,
    "reference_period_id" UUID,
    "source" "TxnSource" NOT NULL DEFAULT 'MANUAL',
    "is_corrected" BOOLEAN NOT NULL DEFAULT false,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "house_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'house_transaction',
    "entity_id" UUID,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "property_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("property_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "periods_property_id_month_key" ON "periods"("property_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "units_property_id_name_key" ON "units"("property_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_property_id_code_key" ON "categories"("property_id", "code");

-- CreateIndex
CREATE INDEX "house_transactions_period_id_category_id_idx" ON "house_transactions"("period_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_default_fund_account_id_fkey" FOREIGN KEY ("default_fund_account_id") REFERENCES "fund_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_accounts" ADD CONSTRAINT "fund_accounts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_reference_period_id_fkey" FOREIGN KEY ("reference_period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_fund_account_id_fkey" FOREIGN KEY ("fund_account_id") REFERENCES "fund_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_transactions" ADD CONSTRAINT "house_transactions_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written: constraints Prisma can't express (PRD §9) ───

ALTER TABLE "units" ADD CONSTRAINT "units_rent_nonneg" CHECK ("default_rent_paisa" >= 0);

ALTER TABLE "house_transactions"
  ADD CONSTRAINT "ht_amount_range" CHECK ("amount_paisa" > 0 AND "amount_paisa" <= 1000000000),
  ADD CONSTRAINT "ht_reserve_expense_only" CHECK (NOT "from_reserve" OR "kind" = 'EXPENSE'),
  ADD CONSTRAINT "ht_void_pair" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL));

ALTER TABLE "attachments"
  ADD CONSTRAINT "att_mime" CHECK ("mime" IN ('image/jpeg','image/png','image/webp','application/pdf')),
  ADD CONSTRAINT "att_size" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880);

-- Partial indexes (PRD §9.2; the P2 trigram vendor index comes with search).
CREATE INDEX "ht_period_kind" ON "house_transactions" ("property_id", "period_id", "kind") WHERE "voided_at" IS NULL;
CREATE INDEX "ht_unit_period" ON "house_transactions" ("unit_id", "period_id") WHERE "voided_at" IS NULL;
CREATE INDEX "ht_fund" ON "house_transactions" ("fund_account_id") WHERE "voided_at" IS NULL;
CREATE INDEX "att_entity" ON "attachments" ("entity_type", "entity_id") WHERE "removed_at" IS NULL;

-- LCK-01: nothing in a CLOSED period can be inserted, changed, or moved
-- in/out — even by direct SQL. The API checks first; this is the backstop.
CREATE OR REPLACE FUNCTION block_closed_period() RETURNS trigger AS $$
BEGIN
  IF (SELECT status FROM periods WHERE id = NEW.period_id) = 'CLOSED' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.period_id <> NEW.period_id
     AND (SELECT status FROM periods WHERE id = OLD.period_id) = 'CLOSED' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "ht_closed_guard" BEFORE INSERT OR UPDATE ON "house_transactions"
  FOR EACH ROW EXECUTE FUNCTION block_closed_period();

-- Financial rows are never deleted: void / soft-remove instead (§3.4).
-- The trigger covers superusers too; the REVOKE covers any separate app role.
CREATE OR REPLACE FUNCTION financial_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "ht_no_delete" BEFORE DELETE ON "house_transactions"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();
CREATE TRIGGER "att_no_delete" BEFORE DELETE ON "attachments"
  FOR EACH ROW EXECUTE FUNCTION financial_no_delete();

REVOKE DELETE ON "house_transactions", "attachments" FROM PUBLIC;
