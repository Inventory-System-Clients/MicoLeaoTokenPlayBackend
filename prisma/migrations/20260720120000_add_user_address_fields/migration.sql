ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_zip_code" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_street" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_number" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_complement" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_neighborhood" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_city" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_state" TEXT;
