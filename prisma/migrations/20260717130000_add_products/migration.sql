DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductOrderPaymentMethod') THEN
    CREATE TYPE "ProductOrderPaymentMethod" AS ENUM ('CREDITS', 'POINTS', 'MONEY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductOrderStatus') THEN
    CREATE TYPE "ProductOrderStatus" AS ENUM ('PENDING_PAYMENT', 'AWAITING_DELIVERY', 'DELIVERED', 'CANCELED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "products" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "price_credits" INTEGER,
  "price_points" INTEGER,
  "price_brl" DECIMAL(10,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_orders" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "payment_method" "ProductOrderPaymentMethod" NOT NULL,
  "credits_spent" INTEGER NOT NULL DEFAULT 0,
  "points_spent" INTEGER NOT NULL DEFAULT 0,
  "amount_brl" DECIMAL(10,2),
  "status" "ProductOrderStatus" NOT NULL DEFAULT 'AWAITING_DELIVERY',
  "checkout_url" TEXT,
  "mp_preference_id" TEXT,
  "mp_payment_id" TEXT,
  "delivered_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_orders_user_id_idx" ON "product_orders"("user_id");
CREATE INDEX IF NOT EXISTS "product_orders_status_idx" ON "product_orders"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_orders_user_id_fkey') THEN
    ALTER TABLE "product_orders"
    ADD CONSTRAINT "product_orders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_orders_product_id_fkey') THEN
    ALTER TABLE "product_orders"
    ADD CONSTRAINT "product_orders_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
