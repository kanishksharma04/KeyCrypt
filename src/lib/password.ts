import { hash, verify } from "@node-rs/argon2";

// Argon2id parameters chosen to take ~300 ms on modern server hardware.
// OWASP recommended minimums: memoryCost ≥ 19456, timeCost ≥ 2.
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, existingHash: string): Promise<boolean> {
  return verify(existingHash, password, ARGON2_OPTIONS);
}

// A real Argon2id hash with the same parameters as above, of a random string
// nobody knows. Verifying against it costs the same time as a real check.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c616bDYDK8smEdSHEqOQVg$P32AUBKOB12eQ9MzrkS98BC8ATXKQ00ioC0lHVkdVJ8";

/**
 * Spend the same time as verifyPassword() when there is no real hash to check
 * (unknown email), so response timing does not reveal which accounts exist.
 * Always resolves to false.
 */
export async function verifyAgainstDummyHash(password: string): Promise<false> {
  await verify(DUMMY_PASSWORD_HASH, password, ARGON2_OPTIONS);
  return false;
}
