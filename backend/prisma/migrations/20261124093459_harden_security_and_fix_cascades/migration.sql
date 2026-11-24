-- DropForeignKey
ALTER TABLE "DailyCashClosing" DROP CONSTRAINT "DailyCashClosing_walletId_fkey";

-- DropForeignKey
ALTER TABLE "StockOrderItem" DROP CONSTRAINT "StockOrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "PasswordResetRequest" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "StockOrderItem" ADD CONSTRAINT "StockOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCashClosing" ADD CONSTRAINT "DailyCashClosing_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
