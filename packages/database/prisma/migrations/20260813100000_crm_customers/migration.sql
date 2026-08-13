-- CreateEnum
CREATE TYPE "FollowupResult" AS ENUM ('NO_DEMAND', 'INTERESTED', 'PENDING_QUOTE', 'PENDING_VISIT', 'DEAL_DONE', 'REFUSED_CONTACT', 'INVALID_NUMBER', 'FOLLOW_UP_LATER');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "sourceChannel" TEXT,
    "ownerStoreId" UUID,
    "ownerEmployeeId" UUID,
    "remark" TEXT,
    "createdById" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIdentity" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourcePayload" JSONB,
    "syncBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowupRecord" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "method" TEXT,
    "result" "FollowupResult" NOT NULL,
    "note" TEXT,
    "intentProduct" TEXT,
    "expectedBuyAt" TIMESTAMPTZ(3),
    "nextFollowupAt" TIMESTAMPTZ(3),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Customer_organizationId_name_idx" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Customer_ownerEmployeeId_idx" ON "Customer"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "CustomerIdentity_customerId_sourceSystem_idx" ON "CustomerIdentity"("customerId", "sourceSystem");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentity_sourceSystem_sourceId_key" ON "CustomerIdentity"("sourceSystem", "sourceId");

-- CreateIndex
CREATE INDEX "FollowupRecord_customerId_occurredAt_idx" ON "FollowupRecord"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "FollowupRecord_nextFollowupAt_idx" ON "FollowupRecord"("nextFollowupAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerStoreId_fkey" FOREIGN KEY ("ownerStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowupRecord" ADD CONSTRAINT "FollowupRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
