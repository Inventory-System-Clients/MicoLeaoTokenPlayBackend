DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoreStatus') THEN
    CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MachineStatus') THEN
    CREATE TYPE "MachineStatus" AS ENUM ('AVAILABLE', 'BUSY', 'MAINTENANCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransactionStatus') THEN
    CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GameplayStatus') THEN
    CREATE TYPE "GameplayStatus" AS ENUM ('SUCCESS', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LoyaltyLevelStatus') THEN
    CREATE TYPE "LoyaltyLevelStatus" AS ENUM ('ACTIVE', 'DRAFT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "cpf" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
  "credit_balance" INTEGER NOT NULL DEFAULT 0,
  "total_credits_purchased" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "stores" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "machines" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "image_url" TEXT,
  "telemetry_id" TEXT NOT NULL,
  "status" "MachineStatus" NOT NULL DEFAULT 'AVAILABLE',
  "cost_per_game" INTEGER NOT NULL,
  "pulses_per_credit" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "loyalty_levels" (
  "id" TEXT NOT NULL,
  "level_name" TEXT NOT NULL,
  "required_credits" INTEGER NOT NULL,
  "bonus_credits_reward" INTEGER NOT NULL DEFAULT 0,
  "status" "LoyaltyLevelStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "credit_packages" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount_brl" DECIMAL(10,2) NOT NULL,
  "base_credits" INTEGER NOT NULL,
  "bonus_credits" INTEGER NOT NULL DEFAULT 0,
  "is_popular" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "package_id" TEXT,
  "amount_brl" DECIMAL(10,2) NOT NULL,
  "credits_awarded" INTEGER NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "checkout_url" TEXT,
  "mp_preference_id" TEXT,
  "mp_payment_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "gameplay_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "machine_id" TEXT NOT NULL,
  "credits_debited" INTEGER NOT NULL,
  "pulses_sent" INTEGER NOT NULL,
  "status" "GameplayStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gameplay_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_cpf_key" ON "users"("cpf");
CREATE UNIQUE INDEX IF NOT EXISTS "machines_telemetry_id_key" ON "machines"("telemetry_id");
CREATE INDEX IF NOT EXISTS "machines_store_id_idx" ON "machines"("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_levels_required_credits_key" ON "loyalty_levels"("required_credits");
CREATE UNIQUE INDEX IF NOT EXISTS "credit_packages_name_key" ON "credit_packages"("name");
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions"("user_id");
CREATE INDEX IF NOT EXISTS "gameplay_logs_user_id_idx" ON "gameplay_logs"("user_id");
CREATE INDEX IF NOT EXISTS "gameplay_logs_machine_id_idx" ON "gameplay_logs"("machine_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machines_store_id_fkey') THEN
    ALTER TABLE "machines"
    ADD CONSTRAINT "machines_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_user_id_fkey') THEN
    ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_package_id_fkey') THEN
    ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "credit_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gameplay_logs_user_id_fkey') THEN
    ALTER TABLE "gameplay_logs"
    ADD CONSTRAINT "gameplay_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gameplay_logs_machine_id_fkey') THEN
    ALTER TABLE "gameplay_logs"
    ADD CONSTRAINT "gameplay_logs_machine_id_fkey"
    FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
