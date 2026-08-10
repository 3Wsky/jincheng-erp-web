-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'LEAVING', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('COMPANY', 'STORE', 'PERSONAL', 'AFTER_SALES', 'ABNORMAL');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('NORMAL', 'LOCKED', 'IN_TRANSIT', 'PENDING_CONFIRM', 'PERSONAL', 'SOLD', 'AFTER_SALES', 'ABNORMAL');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE_RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'PERSONAL_ISSUE', 'PERSONAL_RETURN', 'SALE', 'SALE_RETURN', 'STOCK_GAIN', 'STOCK_LOSS', 'DAMAGE', 'BORROW', 'BORROW_RETURN', 'AFTER_SALES_OUT', 'AFTER_SALES_IN');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CatalogClassificationStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "CatalogImportStatus" AS ENUM ('PREVIEW', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CatalogImportRowStatus" AS ENUM ('VALID', 'INVALID', 'APPLIED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storeId" UUID,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "dataScope" TEXT NOT NULL,
    "scopeConfig" JSONB,
    "approvalLimit" DECIMAL(18,2),

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "fieldPolicy" JSONB,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "classificationStatus" "CatalogClassificationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "color" TEXT,
    "capacity" TEXT,
    "serialManaged" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuBarcode" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuExternalIdentity" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "importBatchId" UUID,
    "sourceSystem" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SkuExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImportBatch" (
    "id" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "sourceCapturedAt" TIMESTAMPTZ(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "CatalogImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "uniqueSkus" INTEGER NOT NULL,
    "warehouseCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "appliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CatalogImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImportRow" (
    "id" BIGSERIAL NOT NULL,
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sourceSkuCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceWarehouseCode" TEXT,
    "sourceWarehouseName" TEXT NOT NULL,
    "sourceSerial" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "CatalogImportRowStatus" NOT NULL,
    "errorCodes" TEXT[],
    "normalizedData" JSONB,
    "appliedProductId" UUID,
    "appliedSkuId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "storeId" UUID,
    "ownerEmployeeId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialItem" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "imeiPrimary" TEXT NOT NULL,
    "imeiSecondary" TEXT,
    "serialNumber" TEXT,
    "currentWarehouseId" UUID NOT NULL,
    "responsibleEmployeeId" UUID,
    "status" "SerialStatus" NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SerialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "documentType" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "skuId" UUID NOT NULL,
    "serialId" UUID,
    "quantity" INTEGER NOT NULL,
    "fromWarehouseId" UUID,
    "toWarehouseId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_organizationId_code_key" ON "Store"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Employee_storeId_status_idx" ON "Employee"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organizationId_employeeNo_key" ON "Employee"("organizationId", "employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_employeeId_key" ON "UserAccount"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_username_key" ON "UserAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Product_organizationId_brand_modelName_idx" ON "Product"("organizationId", "brand", "modelName");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_code_key" ON "Product"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");

-- CreateIndex
CREATE INDEX "Sku_productId_idx" ON "Sku"("productId");

-- CreateIndex
CREATE INDEX "Sku_barcode_idx" ON "Sku"("barcode");

-- CreateIndex
CREATE INDEX "Sku_status_code_idx" ON "Sku"("status", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SkuBarcode_value_key" ON "SkuBarcode"("value");

-- CreateIndex
CREATE INDEX "SkuBarcode_skuId_isPrimary_idx" ON "SkuBarcode"("skuId", "isPrimary");

-- CreateIndex
CREATE INDEX "SkuExternalIdentity_skuId_sourceSystem_idx" ON "SkuExternalIdentity"("skuId", "sourceSystem");

-- CreateIndex
CREATE INDEX "SkuExternalIdentity_importBatchId_idx" ON "SkuExternalIdentity"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuExternalIdentity_sourceSystem_sourceId_key" ON "SkuExternalIdentity"("sourceSystem", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogImportBatch_contentHash_key" ON "CatalogImportBatch"("contentHash");

-- CreateIndex
CREATE INDEX "CatalogImportBatch_sourceSystem_sourceCapturedAt_idx" ON "CatalogImportBatch"("sourceSystem", "sourceCapturedAt");

-- CreateIndex
CREATE INDEX "CatalogImportBatch_status_createdAt_idx" ON "CatalogImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogImportRow_batchId_status_idx" ON "CatalogImportRow"("batchId", "status");

-- CreateIndex
CREATE INDEX "CatalogImportRow_sourceSkuCode_idx" ON "CatalogImportRow"("sourceSkuCode");

-- CreateIndex
CREATE INDEX "CatalogImportRow_sourceSerial_idx" ON "CatalogImportRow"("sourceSerial");

-- CreateIndex
CREATE INDEX "CatalogImportRow_appliedProductId_idx" ON "CatalogImportRow"("appliedProductId");

-- CreateIndex
CREATE INDEX "CatalogImportRow_appliedSkuId_idx" ON "CatalogImportRow"("appliedSkuId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogImportRow_batchId_rowNumber_key" ON "CatalogImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Warehouse_storeId_type_idx" ON "Warehouse"("storeId", "type");

-- CreateIndex
CREATE INDEX "Warehouse_ownerEmployeeId_idx" ON "Warehouse"("ownerEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialItem_imeiPrimary_key" ON "SerialItem"("imeiPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "SerialItem_imeiSecondary_key" ON "SerialItem"("imeiSecondary");

-- CreateIndex
CREATE UNIQUE INDEX "SerialItem_serialNumber_key" ON "SerialItem"("serialNumber");

-- CreateIndex
CREATE INDEX "SerialItem_skuId_status_idx" ON "SerialItem"("skuId", "status");

-- CreateIndex
CREATE INDEX "SerialItem_currentWarehouseId_status_idx" ON "SerialItem"("currentWarehouseId", "status");

-- CreateIndex
CREATE INDEX "SerialItem_responsibleEmployeeId_status_idx" ON "SerialItem"("responsibleEmployeeId", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_documentId_documentType_idx" ON "InventoryMovement"("documentId", "documentType");

-- CreateIndex
CREATE INDEX "InventoryMovement_skuId_occurredAt_idx" ON "InventoryMovement"("skuId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_serialId_occurredAt_idx" ON "InventoryMovement"("serialId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_createdAt_idx" ON "AuditLog"("resource", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_occurredAt_idx" ON "OutboxEvent"("publishedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuBarcode" ADD CONSTRAINT "SkuBarcode_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuExternalIdentity" ADD CONSTRAINT "SkuExternalIdentity_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuExternalIdentity" ADD CONSTRAINT "SkuExternalIdentity_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CatalogImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportRow" ADD CONSTRAINT "CatalogImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CatalogImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportRow" ADD CONSTRAINT "CatalogImportRow_appliedProductId_fkey" FOREIGN KEY ("appliedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportRow" ADD CONSTRAINT "CatalogImportRow_appliedSkuId_fkey" FOREIGN KEY ("appliedSkuId") REFERENCES "Sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_currentWarehouseId_fkey" FOREIGN KEY ("currentWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialItem" ADD CONSTRAINT "SerialItem_responsibleEmployeeId_fkey" FOREIGN KEY ("responsibleEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerialItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
