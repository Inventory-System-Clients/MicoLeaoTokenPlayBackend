ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_version" TEXT;
