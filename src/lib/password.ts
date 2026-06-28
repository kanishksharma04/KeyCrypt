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
