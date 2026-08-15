-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;
