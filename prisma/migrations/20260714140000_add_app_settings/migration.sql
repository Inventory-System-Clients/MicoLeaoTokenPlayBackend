CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('token_value_brl', '1.00', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
