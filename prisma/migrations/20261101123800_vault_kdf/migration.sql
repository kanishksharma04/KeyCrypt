-- AlterTable
ALTER TABLE "VaultMeta" ADD COLUMN     "kdf" TEXT NOT NULL DEFAULT 'pbkdf2',
ADD COLUMN     "kdfParams" JSONB;
