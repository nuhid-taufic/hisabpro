-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "costPricePaisa" INTEGER NOT NULL DEFAULT 0,
    "mrpPricePaisa" INTEGER NOT NULL DEFAULT 0,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowStockLimit" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactId" TEXT,
    "totalAmountPaisa" INTEGER NOT NULL,
    "paidAmountPaisa" INTEGER NOT NULL DEFAULT 0,
    "dueAmountPaisa" INTEGER NOT NULL DEFAULT 0,
    "profitPaisa" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "mrpPricePaisa" INTEGER NOT NULL,
    "unitPricePaisa" INTEGER NOT NULL,
    "costPricePaisa" INTEGER NOT NULL,
    "priceVariancePaisa" INTEGER NOT NULL DEFAULT 0,
    "lineTotalPaisa" INTEGER NOT NULL,

    CONSTRAINT "StockOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCashClosing" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "closingDate" TEXT NOT NULL,
    "expectedCashPaisa" INTEGER NOT NULL,
    "actualCashPaisa" INTEGER NOT NULL,
    "discrepancyPaisa" INTEGER NOT NULL,
    "notesBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCashClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockOrder_orderNumber_key" ON "StockOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCashClosing_walletId_closingDate_key" ON "DailyCashClosing"("walletId", "closingDate");

-- AddForeignKey
ALTER TABLE "StockOrder" ADD CONSTRAINT "StockOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrderItem" ADD CONSTRAINT "StockOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StockOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrderItem" ADD CONSTRAINT "StockOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCashClosing" ADD CONSTRAINT "DailyCashClosing_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
