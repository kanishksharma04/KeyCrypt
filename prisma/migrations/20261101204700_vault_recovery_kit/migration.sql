-- AlterTable
ALTER TABLE "VaultMeta" ADD COLUMN     "recoveryCreatedAt" TIMESTAMP(3),
ADD COLUMN     "recoveryIv" TEXT,
ADD COLUMN     "recoveryWrappedKey" TEXT;
