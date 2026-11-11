-- AlterTable
ALTER TABLE "VaultItem" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VaultItem_userId_deletedAt_idx" ON "VaultItem"("userId", "deletedAt");
