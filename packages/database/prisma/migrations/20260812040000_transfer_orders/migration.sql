-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'EXCEPTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferLineStatus" AS ENUM ('PENDING', 'LOCKED', 'SHIPPED', 'RECEIVED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "TransferExceptionType" AS ENUM ('MISSING', 'WRONG_ITEM', 'DAMAGED', 'REJECTED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "TransferOrder" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "fromWarehouseId" UUID NOT NULL,
    "toWarehouseId" UUID NOT NULL,
    "remark" TEXT,
    "createdById" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "rejectedReason" TEXT,
    "lockedAt" TIMESTAMPTZ(3),
    "shippedById" UUID,
    "shippedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransferOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "serialId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "status" "TransferLineStatus" NOT NULL DEFAULT 'PENDING',
    "exceptionType" "TransferExceptionType",
    "exceptionNote" TEXT,
    "receivedById" UUID,
    "receivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferOrder_code_key" ON "TransferOrder"("code");

-- CreateIndex
CREATE INDEX "TransferOrder_status_createdAt_idx" ON "TransferOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TransferOrder_fromWarehouseId_status_idx" ON "TransferOrder"("fromWarehouseId", "status");

-- CreateIndex
CREATE INDEX "TransferOrder_toWarehouseId_status_idx" ON "TransferOrder"("toWarehouseId", "status");

-- CreateIndex
CREATE INDEX "TransferLine_serialId_status_idx" ON "TransferLine"("serialId", "status");

-- CreateIndex
CREATE INDEX "TransferLine_transferId_status_idx" ON "TransferLine"("transferId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransferLine_transferId_serialId_key" ON "TransferLine"("transferId", "serialId");

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerialItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
