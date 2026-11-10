-- System expense category for loan write-offs (Advances & Loans PRD F10).
-- Mirrors the last entry of lib/master-data/defaults.ts; idempotent.
INSERT INTO "categories" ("id", "property_id", "kind", "code", "name_en", "name_bn", "is_system", "sort_order", "updated_at")
SELECT gen_random_uuid(), p."id", 'EXPENSE'::"TxnKind", 'LOAN_WRITTEN_OFF', 'Loan written off', 'ঋণ মওকুফ', true, 200, now()
FROM "properties" p
ON CONFLICT ("property_id", "code") DO NOTHING;
