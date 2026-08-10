-- Preserve the original 管家婆 export/cache as immutable migration evidence.
CREATE TABLE "CatalogImportDocument" (
    "batchId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImportDocument_pkey" PRIMARY KEY ("batchId")
);

ALTER TABLE "CatalogImportDocument"
ADD CONSTRAINT "CatalogImportDocument_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "CatalogImportBatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
