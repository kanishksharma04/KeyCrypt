-- AlterTable
ALTER TABLE "VaultMeta" ADD COLUMN     "cryptoVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "wrapIv" TEXT,
ADD COLUMN     "wrappedVaultKey" TEXT;
