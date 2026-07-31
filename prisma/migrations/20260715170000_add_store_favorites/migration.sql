CREATE TABLE IF NOT EXISTS "store_favorites" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_favorites_user_id_store_id_key"
  ON "store_favorites"("user_id", "store_id");

CREATE INDEX IF NOT EXISTS "store_favorites_store_id_idx"
  ON "store_favorites"("store_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_favorites_user_id_fkey'
  ) THEN
    ALTER TABLE "store_favorites"
      ADD CONSTRAINT "store_favorites_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_favorites_store_id_fkey'
  ) THEN
    ALTER TABLE "store_favorites"
      ADD CONSTRAINT "store_favorites_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
