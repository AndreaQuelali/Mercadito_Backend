-- SPEC 11: one order per seller + delivery data.
-- Existing orders are split by seller from their OrderItems; totals and contents are kept.

-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('pickup', 'delivery');

-- AlterTable (new columns start nullable / defaulted so existing rows can be backfilled)
ALTER TABLE "Order"
  ADD COLUMN "sellerId"     TEXT,
  ADD COLUMN "checkoutId"   TEXT,
  ADD COLUMN "fulfillment"  "Fulfillment" NOT NULL DEFAULT 'pickup',
  ADD COLUMN "address"      TEXT,
  ADD COLUMN "addressRef"   TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "note"         TEXT,
  ADD COLUMN "splitKey"     TEXT; -- temporary, dropped below

-- One row per (order, seller); rn = 1 is the seller that keeps the original order row
CREATE TEMP TABLE "_order_split" AS
SELECT
  oi."orderId" AS "orderId",
  p."sellerId" AS "sellerId",
  SUM(oi."price" * oi."quantity") AS "total",
  ROW_NUMBER() OVER (PARTITION BY oi."orderId" ORDER BY p."sellerId") AS "rn"
FROM "OrderItem" oi
JOIN "Product" p ON p."id" = oi."productId"
GROUP BY oi."orderId", p."sellerId";

-- Every existing order is its own purchase; its split parts share the checkoutId
UPDATE "Order" SET "checkoutId" = gen_random_uuid()::text;

-- The first seller keeps the original order
UPDATE "Order" o
SET "sellerId" = s."sellerId", "total" = s."total"
FROM "_order_split" s
WHERE s."orderId" = o."id" AND s."rn" = 1;

-- Keep the id sequence ahead of existing ids (rows loaded with explicit ids would collide)
SELECT setval(pg_get_serial_sequence('"Order"', 'id'), COALESCE((SELECT MAX("id") FROM "Order"), 1));

-- Each additional seller gets a new order with the same status, dates and checkoutId
INSERT INTO "Order" ("userId", "sellerId", "checkoutId", "status", "total", "fulfillment", "splitKey", "createdAt", "updatedAt")
SELECT o."userId", s."sellerId", o."checkoutId", o."status", s."total", 'pickup', s."orderId" || ':' || s."sellerId", o."createdAt", o."updatedAt"
FROM "_order_split" s
JOIN "Order" o ON o."id" = s."orderId"
WHERE s."rn" > 1;

-- Move the items of those sellers to their new order
UPDATE "OrderItem" oi
SET "orderId" = n."id"
FROM "Product" p, "Order" n
WHERE p."id" = oi."productId"
  AND n."splitKey" = oi."orderId" || ':' || p."sellerId";

-- Orders without items cannot belong to a seller; checkout never creates them
DELETE FROM "Order" WHERE "sellerId" IS NULL;

-- Existing orders had no delivery data: pickup, with the buyer's phone
UPDATE "Order" o
SET "contactPhone" = u."phoneCountryCode" || ' ' || u."phoneNumber"
FROM "User" u
WHERE u."id" = o."userId";

ALTER TABLE "Order" DROP COLUMN "splitKey";
ALTER TABLE "Order" ALTER COLUMN "fulfillment" DROP DEFAULT;
ALTER TABLE "Order"
  ALTER COLUMN "sellerId" SET NOT NULL,
  ALTER COLUMN "checkoutId" SET NOT NULL,
  ALTER COLUMN "contactPhone" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Order_sellerId_status_idx" ON "Order"("sellerId", "status");
CREATE INDEX "Order_checkoutId_idx" ON "Order"("checkoutId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
