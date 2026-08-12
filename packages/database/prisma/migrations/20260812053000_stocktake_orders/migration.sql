-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StocktakeDifferenceType" AS ENUM ('MISSING', 'UNEXPECTED');

-- CreateTable
CREATE TABLE "StocktakeOrder" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshotCount" INTEGER,
    "remark" TEXT,
    "createdById" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "rejectedReason" TEXT,
    "postedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StocktakeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeScan" (
    "id" UUID NOT NULL,
    "stocktakeId" UUID NOT NULL,
    "imei" TEXT NOT NULL,
    "serialId" UUID,
    "scannedById" UUID NOT NULL,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StocktakeScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeDifference" (
    "id" UUID NOT NULL,
    "stocktakeId" UUID NOT NULL,
    "type" "StocktakeDifferenceType" NOT NULL,
    "serialId" UUID,
    "imei" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StocktakeDifference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeOrder_code_key" ON "StocktakeOrder"("code");

-- CreateIndex
CREATE INDEX "StocktakeOrder_warehouseId_status_idx" ON "StocktakeOrder"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "StocktakeOrder_status_createdAt_idx" ON "StocktakeOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StocktakeScan_stocktakeId_idx" ON "StocktakeScan"("stocktakeId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeScan_stocktakeId_imei_key" ON "StocktakeScan"("stocktakeId", "imei");

-- CreateIndex
CREATE INDEX "StocktakeDifference_stocktakeId_type_idx" ON "StocktakeDifference"("stocktakeId", "type");

-- AddForeignKey
ALTER TABLE "StocktakeOrder" ADD CONSTRAINT "StocktakeOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeScan" ADD CONSTRAINT "StocktakeScan_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "StocktakeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeDifference" ADD CONSTRAINT "StocktakeDifference_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "StocktakeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
