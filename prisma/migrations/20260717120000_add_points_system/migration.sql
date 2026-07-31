ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "points_balance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "loyalty_levels"
ADD COLUMN IF NOT EXISTS "points_awarded" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "credit_packages"
ADD COLUMN IF NOT EXISTS "points_awarded" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "points_awarded" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES
  ('points_per_credit', '0', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
