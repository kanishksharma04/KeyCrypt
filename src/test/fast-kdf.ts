import type { KdfConfig } from "@/lib/crypto";

/**
 * Cheap Argon2id settings for tests (8 MiB, 1 iteration). Real vaults use
 * DEFAULT_KDF_CONFIG (64 MiB, 3 iterations). Tests typically mock deriveKek to
 * always use this, so a vault created and unlocked in a test stays consistent.
 */
export const FAST_TEST_KDF: KdfConfig = {
  kdf: "argon2id",
  params: { memoryKiB: 8_192, iterations: 1, parallelism: 1, hashLength: 32 },
};
