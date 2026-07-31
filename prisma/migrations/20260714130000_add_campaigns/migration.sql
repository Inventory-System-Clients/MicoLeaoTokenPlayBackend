CREATE TABLE IF NOT EXISTS "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campaign_package_overrides" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "amount_brl" DECIMAL(10,2) NOT NULL,
    "base_credits" INTEGER NOT NULL,
    "bonus_credits" INTEGER NOT NULL DEFAULT 0,
    "is_popular" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_package_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campaign_machine_overrides" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "cost_per_game" INTEGER NOT NULL,
    "pulses_per_credit" INTEGER NOT NULL,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_machine_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "campaigns_active_starts_at_ends_at_idx" ON "campaigns"("active", "starts_at", "ends_at");
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_package_overrides_campaign_id_package_id_key" ON "campaign_package_overrides"("campaign_id", "package_id");
CREATE INDEX IF NOT EXISTS "campaign_package_overrides_package_id_idx" ON "campaign_package_overrides"("package_id");
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_machine_overrides_campaign_id_machine_id_key" ON "campaign_machine_overrides"("campaign_id", "machine_id");
CREATE INDEX IF NOT EXISTS "campaign_machine_overrides_machine_id_idx" ON "campaign_machine_overrides"("machine_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_package_overrides_campaign_id_fkey'
  ) THEN
    ALTER TABLE "campaign_package_overrides"
    ADD CONSTRAINT "campaign_package_overrides_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_package_overrides_package_id_fkey'
  ) THEN
    ALTER TABLE "campaign_package_overrides"
    ADD CONSTRAINT "campaign_package_overrides_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "credit_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_machine_overrides_campaign_id_fkey'
  ) THEN
    ALTER TABLE "campaign_machine_overrides"
    ADD CONSTRAINT "campaign_machine_overrides_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_machine_overrides_machine_id_fkey'
  ) THEN
    ALTER TABLE "campaign_machine_overrides"
    ADD CONSTRAINT "campaign_machine_overrides_machine_id_fkey"
    FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
