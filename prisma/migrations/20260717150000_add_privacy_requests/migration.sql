DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivacyRequestType') THEN
    CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'CONSENT_REVOCATION', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivacyRequestStatus') THEN
    CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'COMPLETED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "PrivacyRequestType" NOT NULL,
  "message" TEXT NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
  "response" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "privacy_requests_user_id_idx" ON "privacy_requests"("user_id");
CREATE INDEX IF NOT EXISTS "privacy_requests_status_created_at_idx" ON "privacy_requests"("status", "created_at");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'privacy_requests_user_id_fkey'
  ) THEN
    ALTER TABLE "privacy_requests"
      ADD CONSTRAINT "privacy_requests_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
