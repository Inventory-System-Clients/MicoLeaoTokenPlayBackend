INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES
  ('token_bundle_amount_brl', '1.00', CURRENT_TIMESTAMP),
  ('token_bundle_credits', '1', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
