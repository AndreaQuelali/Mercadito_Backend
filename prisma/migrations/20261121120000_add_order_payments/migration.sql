-- SPEC 12: manual payments (cash on delivery or QR/transfer with a proof).

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash_on_delivery', 'qr_transfer');
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'proof_uploaded', 'paid', 'rejected');

-- AlterTable: existing orders are cash on delivery and unpaid
ALTER TABLE "Order"
  ADD COLUMN "paymentMethod"       "PaymentMethod" NOT NULL DEFAULT 'cash_on_delivery',
  ADD COLUMN "paymentStatus"       "PaymentStatus" NOT NULL DEFAULT 'unpaid',
  ADD COLUMN "paymentProofUrl"     TEXT,
  ADD COLUMN "paymentRejectReason" TEXT,
  ADD COLUMN "paidAt"              TIMESTAMP(3);
ALTER TABLE "Order" ALTER COLUMN "paymentMethod" DROP DEFAULT;

-- AlterTable: existing stands accept cash only
ALTER TABLE "Seller"
  ADD COLUMN "acceptsCash"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "acceptsQr"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentQrUrl"        TEXT,
  ADD COLUMN "paymentInstructions" TEXT;
