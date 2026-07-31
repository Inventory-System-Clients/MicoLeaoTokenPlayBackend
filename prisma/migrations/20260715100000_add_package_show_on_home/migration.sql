ALTER TABLE "credit_packages"
ADD COLUMN IF NOT EXISTS "show_on_home" BOOLEAN NOT NULL DEFAULT false;
