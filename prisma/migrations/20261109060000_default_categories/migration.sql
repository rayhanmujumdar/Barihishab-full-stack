-- Default income/expense categories for every existing property
-- (Income & Expenses PRD §2.2, EXP-02). Properties created later get them from
-- `pnpm db:seed` (lib/master-data/defaults.ts — keep both lists in sync; a test checks).
-- Idempotent: existing codes (incl. renamed or deactivated ones) are left untouched.
INSERT INTO "categories" ("id", "property_id", "kind", "code", "name_en", "name_bn", "is_system", "sort_order", "updated_at")
SELECT gen_random_uuid(), p."id", d.kind::"TxnKind", d.code, d.name_en, d.name_bn, d.is_system, d.sort_order, now()
FROM "properties" p
CROSS JOIN (VALUES
  ('INCOME', 'RENT', 'House rent', 'বাড়ি ভাড়া', true, 0),
  ('INCOME', 'ARREAR', 'Arrear rent', 'বকেয়া ভাড়া', true, 10),
  ('INCOME', 'ROOFTOP', 'Rooftop / tower lease', 'ছাদ / টাওয়ার ভাড়া', false, 20),
  ('INCOME', 'PARKING', 'Parking / garage rent', 'পার্কিং / গ্যারেজ ভাড়া', false, 30),
  ('INCOME', 'OTHER_INC', 'Other income', 'অন্যান্য আয়', false, 40),
  ('INCOME', 'ADJUSTMENT_INC', 'Adjustment', 'সমন্বয়', true, 50),
  ('EXPENSE', 'ELEC', 'Electricity', 'বিদ্যুৎ', false, 60),
  ('EXPENSE', 'GAS', 'Gas', 'গ্যাস', false, 70),
  ('EXPENSE', 'WATER', 'Water', 'পানি', false, 80),
  ('EXPENSE', 'REPAIR', 'Repairs', 'মেরামত', false, 90),
  ('EXPENSE', 'CLEANING', 'Cleaning & maintenance', 'পরিষ্কার ও রক্ষণাবেক্ষণ', false, 100),
  ('EXPENSE', 'SALARY', 'Guard / salary', 'দারোয়ান / বেতন', false, 110),
  ('EXPENSE', 'LIFT', 'Lift maintenance', 'লিফট রক্ষণাবেক্ষণ', false, 120),
  ('EXPENSE', 'GENERATOR', 'Generator & fuel', 'জেনারেটর ও জ্বালানি', false, 130),
  ('EXPENSE', 'INTERNET', 'Internet & cable TV', 'ইন্টারনেট ও ডিশ', false, 140),
  ('EXPENSE', 'HOLDING_TAX', 'Holding tax', 'হোল্ডিং ট্যাক্স', false, 150),
  ('EXPENSE', 'BANK_CHARGE', 'Bank & mobile banking charges', 'ব্যাংক ও মোবাইল ব্যাংকিং চার্জ', false, 160),
  ('EXPENSE', 'OWNER_GRANT', 'Owner special grant', 'মালিকের বিশেষ অনুদান', true, 170),
  ('EXPENSE', 'OTHER_EXP', 'Other', 'অন্যান্য', false, 180),
  ('EXPENSE', 'ADJUSTMENT_EXP', 'Adjustment', 'সমন্বয়', true, 190)
) AS d(kind, code, name_en, name_bn, is_system, sort_order)
ON CONFLICT ("property_id", "code") DO NOTHING;
