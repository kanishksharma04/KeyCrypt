import { describe, it, expect } from "vitest";
import {
  generateSalt,
  generateIv,
  deriveVaultKey,
  SALT_LENGTH,
  IV_LENGTH,
} from "../key-derivation";

// Use minimal iterations in tests for speed. The algorithm is identical;
// iteration count only affects brute-force resistance.
const TEST_ITERATIONS = 1;

describe("generateSalt", () => {
  it(`produces ${SALT_LENGTH} bytes`, () => {
    expect(generateSalt()).toHaveLength(SALT_LENGTH);
  });

  it("produces unique values on each call", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toEqual(b);
  });

  it("returns a Uint8Array", () => {
    expect(generateSalt()).toBeInstanceOf(Uint8Array);
  });
});

describe("generateIv", () => {
  it(`produces ${IV_LENGTH} bytes`, () => {
    expect(generateIv()).toHaveLength(IV_LENGTH);
  });

  it("produces unique values on each call", () => {
    // Statistically certain: P(collision) = 1/2^96 ≈ 0
    const ivs = Array.from({ length: 10 }, () => generateIv().toString());
    expect(new Set(ivs).size).toBe(10);
  });
});

describe("deriveVaultKey", () => {
  const password = "correct-horse-battery-staple!9";
  const salt = new Uint8Array(SALT_LENGTH).fill(42);

  it("derives a CryptoKey", async () => {
    const key = await deriveVaultKey(password, salt, TEST_ITERATIONS);
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it("derived key is marked non-extractable", async () => {
    const key = await deriveVaultKey(password, salt, TEST_ITERATIONS);
    expect(key.extractable).toBe(false);
  });

  it("derived key is for AES-GCM", async () => {
    const key = await deriveVaultKey(password, salt, TEST_ITERATIONS);
    expect(key.algorithm.name).toBe("AES-GCM");
  });

  it("derived key allows encrypt and decrypt", async () => {
    const key = await deriveVaultKey(password, salt, TEST_ITERATIONS);
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
  });

  it("same password + salt → same key material (deterministic)", async () => {
    // We can't compare CryptoKey objects directly (non-extractable), but we can
    // verify determinism by encrypting/decrypting with both keys.
    const key1 = await deriveVaultKey(password, salt, TEST_ITERATIONS);
    const key2 = await deriveVaultKey(password, salt, TEST_ITERATIONS);
    const iv = new Uint8Array(IV_LENGTH).fill(1);
    const plaintext = new TextEncoder().encode("determinism test");

    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key1,
      plaintext
    );

    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key2,
      ciphertext
    );

    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it("different password → different key (decrypt fails)", async () => {
    const key1 = await deriveVaultKey("password-one", salt, TEST_ITERATIONS);
    const key2 = await deriveVaultKey("password-two", salt, TEST_ITERATIONS);
    const iv = new Uint8Array(IV_LENGTH).fill(2);
    const plaintext = new TextEncoder().encode("cross-key-test");

    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key1,
      plaintext
    );

    await expect(
      globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key2, ciphertext)
    ).rejects.toThrow();
  });

  it("different salt → different key", async () => {
    const saltA = new Uint8Array(SALT_LENGTH).fill(0xaa);
    const saltB = new Uint8Array(SALT_LENGTH).fill(0xbb);
    const key1 = await deriveVaultKey(password, saltA, TEST_ITERATIONS);
    const key2 = await deriveVaultKey(password, saltB, TEST_ITERATIONS);
    const iv = new Uint8Array(IV_LENGTH).fill(3);
    const plaintext = new TextEncoder().encode("salt-difference-test");

    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key1,
      plaintext
    );

    await expect(
      globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key2, ciphertext)
    ).rejects.toThrow();
  });
});
