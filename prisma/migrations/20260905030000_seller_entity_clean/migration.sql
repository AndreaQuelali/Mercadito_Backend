-- Seller entity + UserRole admin|user (clean break; no data preserved)

-- Clear dependent rows so FK/enum changes are safe in development
TRUNCATE TABLE "Review", "OrderItem", "Order", "CartItem", "Cart", "Product" RESTART IDENTITY CASCADE;

-- Drop Product -> User FK (sellerId previously pointed at User)
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_sellerId_fkey";

-- SellerStatus + Seller table
CREATE TYPE "SellerStatus" AS ENUM ('active', 'suspended');

CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "location" TEXT,
    "status" "SellerStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");

ALTER TABLE "Seller" ADD CONSTRAINT "Seller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Replace UserRole: admin | seller | client  ->  admin | user
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING (
  CASE
    WHEN ("role"::text = 'admin') THEN 'admin'::"UserRole"
    ELSE 'user'::"UserRole"
  END
);
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'user'::"UserRole";
DROP TYPE "UserRole_old";

-- Product.sellerId now references Seller
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
