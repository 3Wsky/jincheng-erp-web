-- CreateEnum
CREATE TYPE "PersonalStockType" AS ENUM ('ISSUE', 'RETURN', 'HANDOVER');

-- CreateEnum
CREATE TYPE "PersonalStockStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonalStockLineStatus" AS ENUM ('PENDING', 'LOCKED', 'DONE');

-- CreateTable
CREATE TABLE "PersonalStockOrder" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PersonalStockType" NOT NULL,
    "status" "PersonalStockStatus" NOT NULL DEFAULT 'DRAFT',
    "fromWarehouseId" UUID NOT NULL,
    "toWarehouseId" UUID NOT NULL,
    "fromEmployeeId" UUID,
    "toEmployeeId" UUID,
    "remark" TEXT,
    "createdById" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PersonalStockOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalStockLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "serialId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "status" "PersonalStockLineStatus" NOT NULL DEFAULT 'PENDING',
    "lockedFromStatus" "SerialStatus",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PersonalStockLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalStockOrder_code_key" ON "PersonalStockOrder"("code");

-- CreateIndex
CREATE INDEX "PersonalStockOrder_status_createdAt_idx" ON "PersonalStockOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalStockOrder_type_status_idx" ON "PersonalStockOrder"("type", "status");

-- CreateIndex
CREATE INDEX "PersonalStockOrder_fromEmployeeId_status_idx" ON "PersonalStockOrder"("fromEmployeeId", "status");

-- CreateIndex
CREATE INDEX "PersonalStockOrder_toEmployeeId_status_idx" ON "PersonalStockOrder"("toEmployeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalStockLine_orderId_serialId_key" ON "PersonalStockLine"("orderId", "serialId");

-- CreateIndex
CREATE INDEX "PersonalStockLine_serialId_status_idx" ON "PersonalStockLine"("serialId", "status");

-- CreateIndex
CREATE INDEX "PersonalStockLine_orderId_status_idx" ON "PersonalStockLine"("orderId", "status");

-- AddForeignKey
ALTER TABLE "PersonalStockOrder" ADD CONSTRAINT "PersonalStockOrder_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalStockOrder" ADD CONSTRAINT "PersonalStockOrder_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalStockOrder" ADD CONSTRAINT "PersonalStockOrder_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalStockOrder" ADD CONSTRAINT "PersonalStockOrder_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalStockLine" ADD CONSTRAINT "PersonalStockLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PersonalStockOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalStockLine" ADD CONSTRAINT "PersonalStockLine_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerialItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalStockLine" ADD CONSTRAINT "PersonalStockLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
